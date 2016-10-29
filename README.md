# Leaflet.TileLayer.GL

A [LeafletJS](http://www.leafletjs.com) plugin to appy WebGL shaders to your tiles.

With this plugin, you can apply colour transforms to your tiles, merge two or 
more tiles with a custom function, perform on-the-fly hillshading, or create synthetic
tile layers based only on the map coordinates.

## Demo

#### On-the-fly colouring

This demo loads the ["toner" map style by Stamen](http://maps.stamen.com/toner/) and changes the colours on-the-fly:

[http://ivansanchez.gitlab.io/Leaflet.TileLayer.GL/demo/demo-antitoner.html](http://ivansanchez.gitlab.io/Leaflet.TileLayer.GL/demo/demo-antitoner.html)

#### Mandelbrot set

This demo loads no tiles and uses the map coordinates to draw a fractal set:

[http://ivansanchez.gitlab.io/Leaflet.TileLayer.GL/demo/demo-mandelbrot.html](http://ivansanchez.gitlab.io/Leaflet.TileLayer.GL/demo/demo-mandelbrot.html)


#### Flood & height

This demo uses [MapBox's "Terrain-RGB" tiles](https://www.mapbox.com/blog/terrain-rgb/) to play with the elevation: areas are coloured depending to the elevation (below 0 meters, between 0 and 5 meters, between 5 and 10 meters, above 10 meters).

[http://ivansanchez.gitlab.io/Leaflet.TileLayer.GL/demo/demo-flood.html](http://ivansanchez.gitlab.io/Leaflet.TileLayer.GL/demo/demo-flood.html)


## Why?

Leaflet has been lagging behind when it comes to WebGL technology. Other map libraries (such as [OpenLayers 3]() and most notably [Tangram](https://mapzen.com/products/tangram/)) can already use WebGL shaders to apply transformations to map tiles and do fancy stuff.

The inflexion point are [MapBox's "Terrain-RGB" tiles](https://www.mapbox.com/blog/terrain-rgb/). WebGL manipulation of these tiles can provide real-time terrain relief and hill shading.

This takes some inspiration from [shadertoy.com](http://www.shadertoy.com), in the sense that the shaders work on two triangles with some predefined attributes and uniforms.

## Compatibility

Leaflet 1.0.1 (or newer), and a web browser that supports both [WebGL](http://caniuse.com/#search=webgl) and [ES6 `Promise`s](http://caniuse.com/#search=promise). You can also use a `Promise` polyfill for IE11.

## Usage

Include Leaflet and Leaflet.TileLayer.GL in your HTML:

```
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.0.1/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.0.1/dist/leaflet.js"></script>
<script src='https://unpkg.com/leaflet.TileLayer.gl@latest/src/Leaflet.TileLayer.GL'></script>
```

Alternatively, fetch a local copy of Leaflet and Leaflet.TileLayer.GL with `npm install --save leaflet; npm install --save leaflet.tilelayer.gl` or `yarn add leaflet; yarn add leaflet.tilelayer.gl`

You can create instances of `L.TileLayer.GL` in your code. These take three new options: `vertexShader`, `fragmentShader` and `tileUrls`, e.g.:

```
	var antitoner = L.tileLayer.gl({
		vertexShader: "// String with GLSL vertex shader code",
		fragmentShader: "// String with GLSL fragment shader code",
		tileUrls: ['http://{s}.tile.stamen.com/toner/{z}/{x}/{y}.png']
	}).addTo(map);
```

Using this plugin requires some knowledge of WebGL and GLSL shaders. If you've never heard the terms "vertex shader" or "fragment shader", read [this WebGL tutorial](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial/Getting_started_with_WebGL) to become acquinted, or [The Book Of Shaders](https://thebookofshaders.com/) to learn to do cool shaders.

The `vertexShader` and `fragmentShader` options contain shader code, in strings. For every map tile, the shaders will run once, on two triangles. This plugin does not allow you to create more triangles.

The vertex shader receives the following **attributes**:

* `aCRSCoords`: a `vec2` containing the *map* coordinates for the vertices (with values like `LatLng`s).
* `aVertexCoords`: a `vec2` containing the *viewport* coordinates for the vertices (with values from `-1.0` to `+1.0`). These make the two triangles span a whole tile.
* `aTextureCoords`: a `vec2` containing the *texture* coordinates for the vertices. Use this for fetching texels.

The fragment shader receives the following **uniforms**:

* `uTexture0`: a `sampler2D` referring to the first loaded tile image. This exists only if the `tileUrls` option is not empty.
* `uTexture1`..`uTexture7`: texture samplers for the 2nd through 8th image.

## Demo shaders

This is the code used in the "antitoner" demo, commented and explained:

```js
// Create the vertex shader as a multi-line string. Note the "`" character, valid only in ES6 JavaScript.
var antiTonerVertexShader = `
	attribute vec2 aVertexCoords;
	attribute vec2 aTextureCoords;
	varying vec2 vTextureCoords;
	
	void main(void) {
		gl_Position = vec4(aVertexCoords , 1.0, 1.0);	// Use the vertex coords as given
		vTextureCoords = aTextureCoords;	// Pass the texture coords to the frag shader
	}
`

var fragmentShader = `
	precision highp float;
	uniform sampler2D uTexture0;	// This contains a reference to the tile image loaded from the network
	varying vec2 vTextureCoords;	// This is the interpolated texel coords for this fragment
	
	void main(void) {
		// Classic texel look-up
		vec4 texelColour = texture2D(uTexture0, vec2(vTextureCoords.s, vTextureCoords.t));
		
		// If uncommented, this would output the image "as is"
		// gl_FragColor = texelColour;
		
		// Let's mix the colours a little bit, inverting the red and green channels.
		gl_FragColor = vec4(1.0 - texelColour.rg, texelColour.b, 1.0);
	}
`

// Instantiate our L.TileLayer.GL...
var antitoner = L.tileLayer.gl({
	// ... with the shaders we just wrote above...
	vertexShader: antiTonerVertexShader,
	fragmentShader: antiTonerFragmentShader,
	 
	// ...and loading tile images from Stamen Toner as "uTexture0".
	// If this array contained more than one tile template string, 
	// there would be "uTexture1", "uTexture2" and so on.
	tileUrls: ['http://{s}.tile.stamen.com/toner/{z}/{x}/{y}.png']
}).addTo(map);
```

## Legalese

----------------------------------------------------------------------------

"THE BEER-WARE LICENSE":
<ivan@sanchezortega.es> wrote this file. As long as you retain this notice you
can do whatever you want with this stuff. If we meet some day, and you think
this stuff is worth it, you can buy me a beer in return.

----------------------------------------------------------------------------

