/*
 * @class GridLayer.GL
 * @inherits GridLayer
 *
 * This `GridLayer` runs some WebGL code on each grid cell, and puts an image
 * with the result back in place.
 *
 * The contents of each cell can be purely synthetic (based only on the cell
 * coordinates), or be based on some remote tiles (used as textures in the WebGL
 * shaders).
 *
 * The fragment shader is assumed to receive two `vec2` attributes, with the CRS
 * coordinates and the texture coordinates: `aCRSCoords` and `aTextureCoords`.
 * If textures are used, they are accesed through the uniforms `uTexture0` through `uTexture7`
 * There will always be four vertices forming two triangles (a quad).
 *
 */


L.TileLayer.GL = L.GridLayer.extend({

	options: {
		// @option tileUrls: Array
		// Array of tile URL templates (as in `L.TileLayer`), between zero and 8 elements.
		tileUrls: [],

		// @option vertexShader: String
		// A string representing the GLSL vertex shader to be run.
		vertexShader: '',

		// @option fragmentShader: String
		// A string representing the GLSL fragment shader to be run.
		fragmentShader: '',

		subdomains: ['a', 'b', 'c', 'd']
	},

	// On instantiating the layer, it will initialize all the GL context
	//   and upload the shaders to the GPU, along with the vertex buffer
	//   (the vertices will stay the same for all tiles).
	initialize: function (options) {
		options = L.setOptions(this, options);

		this._renderer = L.DomUtil.create('canvas');
		this._renderer.width = this._renderer.height = options.tileSize;

		var gl = this._gl = this._renderer.getContext('webgl', {
			premultipliedAlpha: false
		}) || this._renderer.getContext("experimental-webgl", {
			premultipliedAlpha: false
		});
		gl.viewportWidth  = options.tileSize;
		gl.viewportHeight = options.tileSize;

		this._loadGLProgram();

		// Init textures
		this._textures = [];
		for (var i=0; i<options.tileUrls.length && i<8; i++) {
			gl.bindTexture(gl.TEXTURE_2D, this._textures[i] = gl.createTexture());
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this._size, this._size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

			gl.uniform1i(gl.getUniformLocation(this._glProgram, "uTexture" + i), i);
		}

	},


	_loadGLProgram: function () {
		var gl = this._gl;

		var program = this._glProgram = gl.createProgram();
		var vertexShader   = gl.createShader(gl.VERTEX_SHADER);
		var fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
		gl.shaderSource(vertexShader, this.options.vertexShader);
		gl.shaderSource(fragmentShader, this.options.fragmentShader);
		gl.compileShader(vertexShader);
		gl.compileShader(fragmentShader);
		if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
			console.error(gl.getShaderInfoLog(vertexShader));
			return null;
		}
		if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
			console.error(gl.getShaderInfoLog(fragmentShader));
			return null;
		}
		gl.attachShader(program, vertexShader);
		gl.attachShader(program, fragmentShader);
		gl.linkProgram(program);
		gl.useProgram(program);

		// There will be two vec2 vertex attributes per vertex - aCRSCoords and
		// aTextureCoords
		this._aVertexPosition = gl.getAttribLocation(program, "aVertexCoords");
		this._aTexPosition = gl.getAttribLocation(program, "aTextureCoords");
		this._aCRSPosition = gl.getAttribLocation(program, "aCRSCoords");

// 		console.log('Tex position: ', this._aTexPosition);
// 		console.log('CRS position: ', this._aCRSPosition);

		// Create three data buffer with 8 elements each - the (easting,northing)
		// CRS coords, the (s,t) texture coords and the viewport coords for each
		// of the 4 vertices
		// Data for the texel and viewport coords is totally static, and
		// needs to be declared only once.
		this._CRSBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, this._CRSBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(8), gl.STATIC_DRAW);
		if (this._aCRSPosition !== -1) {
			gl.enableVertexAttribArray(this._aCRSPosition);
			gl.vertexAttribPointer(this._aCRSPosition, 2, gl.FLOAT, false, 8, 0);
		}

		this._TexCoordsBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, this._TexCoordsBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
			1.0, 0.0,
			0.0, 0.0,
			1.0, 1.0,
			0.0, 1.0,
		]), gl.STATIC_DRAW);
		if (this._aTexPosition !== -1) {
			gl.enableVertexAttribArray(this._aTexPosition);
			gl.vertexAttribPointer(this._aTexPosition, 2, gl.FLOAT, false, 8, 0);
		}

		this._VertexCoordsBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, this._VertexCoordsBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
			 1,  1,
			-1,  1,
			 1, -1,
			-1, -1
		]), gl.STATIC_DRAW);
		if (this._aVertexPosition !== -1) {
			gl.enableVertexAttribArray(this._aVertexPosition);
			gl.vertexAttribPointer(this._aVertexPosition, 2, gl.FLOAT, false, 8, 0);
		}

	},

	// This is called once per tile - uses the layer's GL context to
	//   render a tile, passing the complex space coordinates to the
	//   GPU, and asking to render the vertexes (as triangles) again.
	// Every pixel will be opaque, so there is no need to clear the scene.
	_render: function (coords) {
		var gl = this._gl;
		gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
		gl.clearColor(0.5, 0.5, 0.5, 0);
		gl.enable(gl.BLEND);

		var tileBounds = this._tileCoordsToBounds(coords);

		// Create data array for CRS buffer
		var data = [
			// Vertex 0
			tileBounds.getEast(), tileBounds.getNorth(),

			// Vertex 1
			tileBounds.getWest(), tileBounds.getNorth(),

			// Vertex 2
			tileBounds.getEast(), tileBounds.getSouth(),

			// Vertex 3
			tileBounds.getWest(), tileBounds.getSouth(),
		];

		// ...upload them to the GPU...
		gl.bindBuffer(gl.ARRAY_BUFFER, this._CRSBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);

		// ... and then the magic happens.
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

	},

	// Monkey-patch some of the L.TileLayer methods so we can call getTileUrl
	// without errors
	_getSubdomain: L.TileLayer.prototype._getSubdomain,
	_getZoomForUrl: function () { return this._tileZoom; },

	createTile: function (coords, done) {
		var tile = L.DomUtil.create('canvas', 'leaflet-tile');
		tile.width = tile.height = this.options.tileSize;
		tile.onselectstart = tile.onmousemove = L.Util.falseFn;

		var ctx = tile.getContext('2d');
		if (this.options.tileUrls.length === 0) {
			this._render(coords);
			ctx.drawImage(this._renderer, 0, 0);
			setTimeout(done, 50);
		} else {
			var texFetches = [];
			for (var i=0; i<this.options.tileUrls.length && i<8; i++) {
				this._url = this.options.tileUrls[i];

				texFetches.push(new Promise(function (resolve,reject) {
					var tile = document.createElement('img');
					tile.crossOrigin = '';
					tile.src = L.TileLayer.prototype.getTileUrl.call(this, coords);
					L.DomEvent.on(tile, 'load', resolve.bind(this, tile));
					L.DomEvent.on(tile, 'error', reject.bind(this, tile));
				}.bind(this)));
			}

			Promise.all(texFetches)
			.catch(this._tileOnError)
			.then(function (textureImages) {
// 				console.log(textureImages);
				var gl = this._gl;
				for (var i=0; i<this.options.tileUrls.length && i<8; i++) {
					gl.bindTexture(gl.TEXTURE_2D, this._textures[i]);
					gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textureImages[i]);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST);
					gl.generateMipmap(gl.TEXTURE_2D);
				}

				this._render(coords);
				ctx.drawImage(this._renderer, 0, 0);
				done();
			}.bind(this));
		}

		return tile;
	},


});


L.tileLayer.gl = function (opts) {
	return new L.TileLayer.GL(opts);
};
