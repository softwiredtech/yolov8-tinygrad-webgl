# YOLOv8 on [tinygrad](https://github.com/tinygrad/tinygrad) + WebGL

This is a WebGL port of YOLOv8 using [tinygrad](https://github.com/tinygrad/tinygrad). WebGL isn't yet in master, but we have a [PR](https://github.com/tinygrad/tinygrad/pull/2461) up for it.<br>
Try it [here](https://softwiredtech.github.io/yolov8-tinygrad-webgl/)!

## GPGPU using the graphics pipeline

To run the model on WebGL, we added a new tinygrad backend. The beauty in tinygrad is that you can do this in about ~100 lines of code, depending on the backend. We used [moderngl](https://github.com/moderngl/moderngl) to run the kernels in a Python environment, and modified `extra/export_model.py` to support WebGL. It exports all the kernels and a small JS runtime in a single `net.js` file.
With the WebGL backend the kernels are fragment shaders, and the tensor buffers are 2D textures. Indexing is based on `gl_FragCoord`. The get the texture x coordinate (window space), we have to modulo the index with the texture width, and to get the y, we divide with texture width. The window-space x,y are then translated to `uv` space by dividing by texture width and height. Smaller buffers are Nx1, but if the max supported texture dimension is exceeded alongside the x dimension, we create NxM textures.
Each "kernel" invocation actually is just rendering to a framebuffer texture, and that framebuffer texture can be used in subsequent kernels. To get the output of the model we can use `glReadPixels`.

## License

MIT
