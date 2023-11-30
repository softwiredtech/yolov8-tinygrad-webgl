
  function setupNet(gl, safetensor) {

    function createShaderProgram(gl, code) {
      const vertexShader = loadShader(gl, gl.VERTEX_SHADER, '#version 300 es\nin vec2 in_position;in vec2 in_uv;out vec2 uv;void main(){gl_Position=vec4(in_position,0.0,1.0);uv=in_uv;}');
      const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, code);
      const shaderProgram = gl.createProgram();
      gl.attachShader(shaderProgram, vertexShader);
      gl.attachShader(shaderProgram, fragmentShader);
      gl.linkProgram(shaderProgram);

      if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        console.log(`Unable to initialize the shader program: ${gl.getProgramInfoLog(shaderProgram)}`);
        return null;
      }

      return shaderProgram;
    }

    function loadShader(gl, type, source) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);

      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.log(`An error occurred compiling the shaders: ${gl.getShaderInfoLog(shader)}`);
        gl.deleteShader(shader);
        return null;
      }

      return shader;
    }

    function setupVertexData(gl, program, vertices) {
      let vao = gl.createVertexArray();
      gl.bindVertexArray(vao);

      let vertexBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);

      const positionLocation = gl.getAttribLocation(program, 'in_position');
      const uvLocation = gl.getAttribLocation(program, 'in_uv');
      
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 4 * 4, 0);

      gl.enableVertexAttribArray(uvLocation);
      gl.vertexAttribPointer(uvLocation, 2, gl.FLOAT, false, 4 * 4, 2 * 4);

      gl.bindVertexArray(null);

      return vao;
    }

    function runProgram(gl, kernelName, program, textures) {
      let framebuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, textures[0].tex, 0);
      gl.useProgram(program);
      gl.uniform1i(gl.getUniformLocation(program, "w"), textures[0].width);  

      const vao = setupVertexData(gl, program, [-1, 1, 0, 1, -1, -1, 0, 0, 1, 1, 1, 1, 1, -1, 1, 0]);
      gl.bindVertexArray(vao);
      // Texture 0 is the framebuffer texture, so we skip that
      for (let i = 1; i < textures.length; i++) {
        gl.activeTexture(gl.TEXTURE0 + i-1);
        gl.bindTexture(gl.TEXTURE_2D, textures[i].tex);
        gl.uniform1i(gl.getUniformLocation(program, 'data' + i), i-1);
      }

      gl.viewport(0, 0, textures[0].width, textures[0].height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      for (let i = 1; i < textures.length; i++) {
        gl.activeTexture(gl.TEXTURE0 + i-1);
        gl.bindTexture(gl.TEXTURE_2D, null);
      }

      console.log("Finished running: " + kernelName);
    }
    function limitTextureDims(size, threshold) {
      if (size <= threshold) { return [size, 1] };
      
      for (let i = 2; i < threshold + 1; i++) {
        if ((size % i == 0) && (Math.floor(size / i) <= threshold)) {
          return [Math.floor(size / i), i];
        }
      }
      
      return [size, 1];
    }

    function updateTextureData(gl, texture, data, isHalf) {
      gl.bindTexture(gl.TEXTURE_2D, texture.tex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, texture.width, texture.height, gl.RED, (isHalf) ? gl.HALF_FLOAT : gl.FLOAT, data);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }

    function readTextureData(gl, texture) {
      const framebuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture.tex, 0);

      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error('Framebuffer not complete');
      }

      let data = new Float32Array(texture.width * texture.height);
      gl.readPixels(0, 0, texture.width, texture.height, gl.RED, gl.FLOAT, data);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(framebuffer);

      return data;
    }

    function createTexture(gl, size, isHalf, tensorBuffer) {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      const internalFormat = gl.RGBA;
      const texSize = limitTextureDims(size, gl.getParameter(gl.MAX_TEXTURE_SIZE));
      let weights;
      
      if (tensorBuffer != null) {
        if (!isHalf)
          weights = new Float32Array(tensorBuffer.buffer, tensorBuffer.byteOffset, tensorBuffer.byteLength / Float32Array.BYTES_PER_ELEMENT);
        else 
          weights = new Uint16Array(tensorBuffer.buffer, tensorBuffer.byteOffset, tensorBuffer.byteLength / Uint16Array.BYTES_PER_ELEMENT);
      } else {
        if (!isHalf)
          weights = new Float32Array(size).fill(0.0);
        else
          weights = new Uint16Array(size).fill(0.0);
      }

      if (size != weights.length)
        console.log("Weights length: " + weights.length + ", texsize: " + texSize[0]*texSize[1]);

      gl.texImage2D(gl.TEXTURE_2D, 0, (isHalf) ? gl.R16F : gl.R32F, texSize[0], texSize[1], 0, gl.RED, (isHalf) ? gl.HALF_FLOAT : gl.FLOAT, weights);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.bindTexture(gl.TEXTURE_2D, null);
      return { tex: texture, width: texSize[0], height: texSize[1] };
    } 

    const getTensorBuffer = (safetensorBuffer, tensorMetadata) => {
      return safetensorBuffer.subarray(...tensorMetadata.data_offsets);
    }

    const getTensorMetadata = (safetensorBuffer) => {
      const metadataLength = Number(new DataView(safetensorBuffer.buffer).getBigUint64(0, true));
      const metadata = JSON.parse(new TextDecoder("utf8").decode(safetensorBuffer.subarray(8, 8 + metadataLength)));
      return Object.fromEntries(Object.entries(metadata).filter(([k, v]) => k !== "__metadata__").map(([k, v]) => [k, {...v, data_offsets: v.data_offsets.map(x => 8 + metadataLength + x)}]));
    };

    const metadata = getTensorMetadata(safetensor);
  
const r_80_80 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;

out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 80 */
  float acc0 = (0.0);
  for (int ridx0 = (0); ridx0 < (80); ++ridx0) {
    acc0 = (float((float(float(float((float((float(idx0)*float(((-1)))))+float((float(ridx0)*float(((-1)))))))<float(((-78)))))!=0.0?(1.0):(0.0)))+float(acc0));
  }
  out_data = float((float(float(acc0)+float(((-1.0))))+float((0.5))));
}`;

const r_40_40 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;

out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 40 */
  float acc0 = (0.0);
  for (int ridx0 = (0); ridx0 < (40); ++ridx0) {
    acc0 = (float((float(float(float((float((float(idx0)*float(((-1)))))+float((float(ridx0)*float(((-1)))))))<float(((-38)))))!=0.0?(1.0):(0.0)))+float(acc0));
  }
  out_data = float((float(float(acc0)+float(((-1.0))))+float((0.5))));
}`;

const r_20_20 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;

out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 20 */
  float acc0 = (0.0);
  for (int ridx0 = (0); ridx0 < (20); ++ridx0) {
    acc0 = (float((float(float(float((float((float(idx0)*float(((-1)))))+float((float(ridx0)*float(((-1)))))))<float(((-18)))))!=0.0?(1.0):(0.0)))+float(acc0));
  }
  out_data = float((float(float(acc0)+float(((-1.0))))+float((0.5))));
}`;

const r_16_320_320_3_3_3 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 1638400 */
  float acc0 = (0.0);
  for (int ridx0 = (0); ridx0 < (3); ++ridx0) {
    for (int ridx1 = (0); ridx1 < (3); ++ridx1) {
      for (int ridx2 = (0); ridx2 < (3); ++ridx2) {
        float val0 = bool((float(float(float((float((float(ridx2)*float(((-1)))))+float((float((int(idx0)%int((320))))*float(((-2)))))))<float((0))))*float(float(float((float((float(ridx1)*float(((-1)))))+float((float((int((idx0/(320)))%int((320))))*float(((-2)))))))<float((0))))))?(texture(data1, vec2(float(float(int(float(float(float(float(float(ridx2)+float((float((int(idx0)%int((320))))*float((2)))))+float((float(ridx1)*float((640)))))+float((float((int((idx0/(320)))%int((320))))*float((1280)))))+float((float(ridx0)*float((409600)))))+float(((-641))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(float(float(float(float(float(ridx2)+float((float((int(idx0)%int((320))))*float((2)))))+float((float(ridx1)*float((640)))))+float((float((int((idx0/(320)))%int((320))))*float((1280)))))+float((float(ridx0)*float((409600)))))+float(((-641))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):(0.0);
        float val1 = float(texture(data2, vec2(float(float(int(float(float(float((float(ridx0)*float((9))))+float((float(ridx1)*float((3)))))+float(ridx2))+float((float((idx0/(102400)))*float((27)))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(float(float((float(ridx0)*float((9))))+float((float(ridx1)*float((3)))))+float(ridx2))+float((float((idx0/(102400)))*float((27)))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
        acc0 = ((val0*val1)+acc0);
      }
    }
  }
  float val2 = float(texture(data3, vec2(float(float(int(idx0/(102400))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(idx0/(102400))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val3 = float(texture(data4, vec2(float(float(int(idx0/(102400))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(idx0/(102400))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val4 = float(texture(data5, vec2(float(float(int(idx0/(102400))%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(idx0/(102400))/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val5 = float(texture(data6, vec2(float(float(int(idx0/(102400))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(idx0/(102400))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  float alu0 = float((float((float(float((acc0-val2))*float(val3))*float(sqrt(((1.0)/(float(val4)+float((0.001))))))))+float(val5)));
  out_data = float((float(alu0)*float(((1.0)/(float((1.0))+float(exp2((float(alu0)*float(((-1.4426950408889634)))))))))));
}`;

const r_32_160_160_16_3_3 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 819200 */
  float acc0 = (0.0);
  for (int ridx0 = (0); ridx0 < (16); ++ridx0) {
    for (int ridx1 = (0); ridx1 < (3); ++ridx1) {
      for (int ridx2 = (0); ridx2 < (3); ++ridx2) {
        float val0 = bool((float(float(float((float((float(ridx2)*float(((-1)))))+float((float((int(idx0)%int((160))))*float(((-2)))))))<float((0))))*float(float(float((float((float(ridx1)*float(((-1)))))+float((float((int((idx0/(160)))%int((160))))*float(((-2)))))))<float((0))))))?(texture(data1, vec2(float(float(int(float(float(float(float(float(ridx2)+float((float((int(idx0)%int((160))))*float((2)))))+float((float(ridx1)*float((320)))))+float((float((int((idx0/(160)))%int((160))))*float((640)))))+float((float(ridx0)*float((102400)))))+float(((-321))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(float(float(float(float(float(ridx2)+float((float((int(idx0)%int((160))))*float((2)))))+float((float(ridx1)*float((320)))))+float((float((int((idx0/(160)))%int((160))))*float((640)))))+float((float(ridx0)*float((102400)))))+float(((-321))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):(0.0);
        float val1 = float(texture(data2, vec2(float(float(int(float(float(float((float(ridx0)*float((9))))+float((float(ridx1)*float((3)))))+float(ridx2))+float((float((idx0/(25600)))*float((144)))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(float(float((float(ridx0)*float((9))))+float((float(ridx1)*float((3)))))+float(ridx2))+float((float((idx0/(25600)))*float((144)))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
        acc0 = ((val0*val1)+acc0);
      }
    }
  }
  float val2 = float(texture(data3, vec2(float(float(int(idx0/(25600))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(idx0/(25600))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val3 = float(texture(data4, vec2(float(float(int(idx0/(25600))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(idx0/(25600))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val4 = float(texture(data5, vec2(float(float(int(idx0/(25600))%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(idx0/(25600))/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val5 = float(texture(data6, vec2(float(float(int(idx0/(25600))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(idx0/(25600))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  float alu0 = float((float((float(float((acc0-val2))*float(val3))*float(sqrt(((1.0)/(float(val4)+float((0.001))))))))+float(val5)));
  out_data = float((float(alu0)*float(((1.0)/(float((1.0))+float(exp2((float(alu0)*float(((-1.4426950408889634)))))))))));
}`;

const r_32_25600_32 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 819200 */
  float acc0 = (0.0);
  for (int ridx0 = (0); ridx0 < (32); ++ridx0) {
    float val0 = texture(data1, vec2(float(float(int(float((float(ridx0)*float((25600))))+float((int(idx0)%int((25600)))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(float((float(ridx0)*float((25600))))+float((int(idx0)%int((25600)))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r;
    float val1 = float(texture(data2, vec2(float(float(int(float(ridx0)+float((float((idx0/(25600)))*float((32)))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(ridx0)+float((float((idx0/(25600)))*float((32)))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val0*val1)+acc0);
  }
  out_data = float(acc0);
}`;

const E_16_25600 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 409600 */
  float val0 = texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r;
  float val1 = float(texture(data2, vec2(float(float(int(idx0/(25600))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(idx0/(25600))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
  float val2 = float(texture(data3, vec2(float(float(int(idx0/(25600))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(idx0/(25600))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val3 = float(texture(data4, vec2(float(float(int(idx0/(25600))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(idx0/(25600))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val4 = float(texture(data5, vec2(float(float(int(idx0/(25600))%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(idx0/(25600))/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float alu0 = float((float((float(float((val0-val1))*float(val2))*float(sqrt(((1.0)/(float(val3)+float((0.001))))))))+float(val4)));
  out_data = float((float(alu0)*float(((1.0)/(float((1.0))+float(exp2((float(alu0)*float(((-1.4426950408889634)))))))))));
}`;

const E_16_25600n1 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 409600 */
  float val0 = texture(data1, vec2(float(float(int(float(idx0)+float((409600)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(float(idx0)+float((409600)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r;
  float val1 = float(texture(data2, vec2(float(float(int(float((idx0/(25600)))+float((16)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float((idx0/(25600)))+float((16)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
  float val2 = float(texture(data3, vec2(float(float(int(float((idx0/(25600)))+float((16)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(float((idx0/(25600)))+float((16)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val3 = float(texture(data4, vec2(float(float(int(float((idx0/(25600)))+float((16)))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(float((idx0/(25600)))+float((16)))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val4 = float(texture(data5, vec2(float(float(int(float((idx0/(25600)))+float((16)))%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(float((idx0/(25600)))+float((16)))/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float alu0 = float((float((float(float((val0-val1))*float(val2))*float(sqrt(((1.0)/(float(val3)+float((0.001))))))))+float(val4)));
  out_data = float((float(alu0)*float(((1.0)/(float((1.0))+float(exp2((float(alu0)*float(((-1.4426950408889634)))))))))));
}`;

const r_16_160_160_16_3_3 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 409600 */
  float acc0 = (0.0);
  for (int ridx0 = (0); ridx0 < (16); ++ridx0) {
    for (int ridx1 = (0); ridx1 < (3); ++ridx1) {
      for (int ridx2 = (0); ridx2 < (3); ++ridx2) {
        float val0 = bool((float(float(float(float(float((float((float(ridx2)*float(((-1)))))+float((float((int(idx0)%int((160))))*float(((-1)))))))<float((0))))*float(float(float((float(ridx2)+float((int(idx0)%int((160))))))<float((161)))))*float(float(float((float((float(ridx1)*float(((-1)))))+float((float((int((idx0/(160)))%int((160))))*float(((-1)))))))<float((0)))))*float(float(float((float(ridx1)+float((int((idx0/(160)))%int((160))))))<float((161))))))?(texture(data1, vec2(float(float(int(float(float(float(float(float(ridx2)+float((int(idx0)%int((160)))))+float((float(ridx1)*float((160)))))+float((float((int((idx0/(160)))%int((160))))*float((160)))))+float((float(ridx0)*float((25600)))))+float(((-161))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(float(float(float(float(float(ridx2)+float((int(idx0)%int((160)))))+float((float(ridx1)*float((160)))))+float((float((int((idx0/(160)))%int((160))))*float((160)))))+float((float(ridx0)*float((25600)))))+float(((-161))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):(0.0);
        float val1 = float(texture(data2, vec2(float(float(int(float(float(float((float(ridx0)*float((9))))+float((float(ridx1)*float((3)))))+float(ridx2))+float((float((idx0/(25600)))*float((144)))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(float(float((float(ridx0)*float((9))))+float((float(ridx1)*float((3)))))+float(ridx2))+float((float((idx0/(25600)))*float((144)))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
        acc0 = ((val0*val1)+acc0);
      }
    }
  }
  float val2 = float(texture(data3, vec2(float(float(int(idx0/(25600))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(idx0/(25600))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val3 = float(texture(data4, vec2(float(float(int(idx0/(25600))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(idx0/(25600))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val4 = float(texture(data5, vec2(float(float(int(idx0/(25600))%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(idx0/(25600))/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val5 = float(texture(data6, vec2(float(float(int(idx0/(25600))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(idx0/(25600))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  float alu0 = float((float((float(float((acc0-val2))*float(val3))*float(sqrt(((1.0)/(float(val4)+float((0.001))))))))+float(val5)));
  out_data = float((float(alu0)*float(((1.0)/(float((1.0))+float(exp2((float(alu0)*float(((-1.4426950408889634)))))))))));
}`;

const r_16_160_160_16_3_3n1 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
uniform sampler2D data7;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 409600 */
  float acc0 = (0.0);
  for (int ridx0 = (0); ridx0 < (16); ++ridx0) {
    for (int ridx1 = (0); ridx1 < (3); ++ridx1) {
      for (int ridx2 = (0); ridx2 < (3); ++ridx2) {
        float val0 = bool((float(float(float(float(float((float((float(ridx2)*float(((-1)))))+float((float((int(idx0)%int((160))))*float(((-1)))))))<float((0))))*float(float(float((float(ridx2)+float((int(idx0)%int((160))))))<float((161)))))*float(float(float((float((float(ridx1)*float(((-1)))))+float((float((int((idx0/(160)))%int((160))))*float(((-1)))))))<float((0)))))*float(float(float((float(ridx1)+float((int((idx0/(160)))%int((160))))))<float((161))))))?(texture(data2, vec2(float(float(int(float(float(float(float(float(ridx2)+float((int(idx0)%int((160)))))+float((float(ridx1)*float((160)))))+float((float((int((idx0/(160)))%int((160))))*float((160)))))+float((float(ridx0)*float((25600)))))+float(((-161))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(float(float(float(float(ridx2)+float((int(idx0)%int((160)))))+float((float(ridx1)*float((160)))))+float((float((int((idx0/(160)))%int((160))))*float((160)))))+float((float(ridx0)*float((25600)))))+float(((-161))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):(0.0);
        float val1 = float(texture(data3, vec2(float(float(int(float(float(float((float(ridx0)*float((9))))+float((float(ridx1)*float((3)))))+float(ridx2))+float((float((idx0/(25600)))*float((144)))))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(float(float(float((float(ridx0)*float((9))))+float((float(ridx1)*float((3)))))+float(ridx2))+float((float((idx0/(25600)))*float((144)))))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
        acc0 = ((val0*val1)+acc0);
      }
    }
  }
  float val2 = texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r;
  float val3 = float(texture(data4, vec2(float(float(int(idx0/(25600))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(idx0/(25600))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val4 = float(texture(data5, vec2(float(float(int(idx0/(25600))%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(idx0/(25600))/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val5 = float(texture(data6, vec2(float(float(int(idx0/(25600))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(idx0/(25600))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  float val6 = float(texture(data7, vec2(float(float(int(idx0/(25600))%textureSize(data7, 0).x) + 0.5f)/float(textureSize(data7, 0).x), float(float(int(idx0/(25600))/textureSize(data7, 0).x) + 0.5f)/float(textureSize(data7, 0).y))).r);
  float alu0 = float((float((float(float((acc0-val3))*float(val4))*float(sqrt(((1.0)/(float(val5)+float((0.001))))))))+float(val6)));
  out_data = float((float(val2)+float((float(alu0)*float(((1.0)/(float((1.0))+float(exp2((float(alu0)*float(((-1.4426950408889634)))))))))))));
}`;

const E_48_25600 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 1228800 */
  float val0 = bool(float(float((idx0/(25600)))<float((16))))?(texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):(0.0);
  float val1 = bool((float(float(float((float((idx0/(25600)))*float(((-1)))))<float(((-15)))))*float(float(float((idx0/(25600)))<float((32))))))?(texture(data2, vec2(float(float(int(float(idx0)+float(((-409600))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(idx0)+float(((-409600))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):(0.0);
  float val2 = bool(float(float((float((idx0/(25600)))*float(((-1)))))<float(((-31)))))?(texture(data3, vec2(float(float(int(float(idx0)+float(((-819200))))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(float(idx0)+float(((-819200))))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):(0.0);
  out_data = float((float(float(val0)+float(val1))+float(val2)));
}`;

const r_32_25600_48 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 819200 */
  float acc0 = (0.0);
  for (int ridx0 = (0); ridx0 < (48); ++ridx0) {
    float val0 = texture(data1, vec2(float(float(int(float((float(ridx0)*float((25600))))+float((int(idx0)%int((25600)))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(float((float(ridx0)*float((25600))))+float((int(idx0)%int((25600)))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r;
    float val1 = float(texture(data2, vec2(float(float(int(float(ridx0)+float((float((idx0/(25600)))*float((48)))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(ridx0)+float((float((idx0/(25600)))*float((48)))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val0*val1)+acc0);
  }
  float val2 = float(texture(data3, vec2(float(float(int(idx0/(25600))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(idx0/(25600))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val3 = float(texture(data4, vec2(float(float(int(idx0/(25600))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(idx0/(25600))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val4 = float(texture(data5, vec2(float(float(int(idx0/(25600))%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(idx0/(25600))/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val5 = float(texture(data6, vec2(float(float(int(idx0/(25600))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(idx0/(25600))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  float alu0 = float((float((float(float((acc0-val2))*float(val3))*float(sqrt(((1.0)/(float(val4)+float((0.001))))))))+float(val5)));
  out_data = float((float(alu0)*float(((1.0)/(float((1.0))+float(exp2((float(alu0)*float(((-1.4426950408889634)))))))))));
}`;

const r_64_80_80_32_3_3 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 409600 */
  float acc0 = (0.0);
  for (int ridx0 = (0); ridx0 < (32); ++ridx0) {
    for (int ridx1 = (0); ridx1 < (3); ++ridx1) {
      for (int ridx2 = (0); ridx2 < (3); ++ridx2) {
        float val0 = bool((float(float(float((float((float(ridx2)*float(((-1)))))+float((float((int(idx0)%int((80))))*float(((-2)))))))<float((0))))*float(float(float((float((float(ridx1)*float(((-1)))))+float((float((int((idx0/(80)))%int((80))))*float(((-2)))))))<float((0))))))?(texture(data1, vec2(float(float(int(float(float(float(float(float(ridx2)+float((float((int(idx0)%int((80))))*float((2)))))+float((float(ridx1)*float((160)))))+float((float((int((idx0/(80)))%int((80))))*float((320)))))+float((float(ridx0)*float((25600)))))+float(((-161))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(float(float(float(float(float(ridx2)+float((float((int(idx0)%int((80))))*float((2)))))+float((float(ridx1)*float((160)))))+float((float((int((idx0/(80)))%int((80))))*float((320)))))+float((float(ridx0)*float((25600)))))+float(((-161))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):(0.0);
        float val1 = float(texture(data2, vec2(float(float(int(float(float(float((float(ridx0)*float((9))))+float((float(ridx1)*float((3)))))+float(ridx2))+float((float((idx0/(6400)))*float((288)))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(float(float((float(ridx0)*float((9))))+float((float(ridx1)*float((3)))))+float(ridx2))+float((float((idx0/(6400)))*float((288)))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
        acc0 = ((val0*val1)+acc0);
      }
    }
  }
  float val2 = float(texture(data3, vec2(float(float(int(idx0/(6400))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(idx0/(6400))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val3 = float(texture(data4, vec2(float(float(int(idx0/(6400))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(idx0/(6400))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val4 = float(texture(data5, vec2(float(float(int(idx0/(6400))%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(idx0/(6400))/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val5 = float(texture(data6, vec2(float(float(int(idx0/(6400))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(idx0/(6400))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  float alu0 = float((float((float(float((acc0-val2))*float(val3))*float(sqrt(((1.0)/(float(val4)+float((0.001))))))))+float(val5)));
  out_data = float((float(alu0)*float(((1.0)/(float((1.0))+float(exp2((float(alu0)*float(((-1.4426950408889634)))))))))));
}`;

const r_64_6400_64 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 409600 */
  float acc0 = (0.0);
  for (int ridx0 = (0); ridx0 < (64); ++ridx0) {
    float val0 = texture(data1, vec2(float(float(int(float((float(ridx0)*float((6400))))+float((int(idx0)%int((6400)))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(float((float(ridx0)*float((6400))))+float((int(idx0)%int((6400)))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r;
    float val1 = float(texture(data2, vec2(float(float(int(float(ridx0)+float((float((idx0/(6400)))*float((64)))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(ridx0)+float((float((idx0/(6400)))*float((64)))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val0*val1)+acc0);
  }
  out_data = float(acc0);
}`;

const E_32_6400 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 204800 */
  float val0 = texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r;
  float val1 = float(texture(data2, vec2(float(float(int(idx0/(6400))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(idx0/(6400))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
  float val2 = float(texture(data3, vec2(float(float(int(idx0/(6400))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(idx0/(6400))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val3 = float(texture(data4, vec2(float(float(int(idx0/(6400))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(idx0/(6400))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val4 = float(texture(data5, vec2(float(float(int(idx0/(6400))%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(idx0/(6400))/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float alu0 = float((float((float(float((val0-val1))*float(val2))*float(sqrt(((1.0)/(float(val3)+float((0.001))))))))+float(val4)));
  out_data = float((float(alu0)*float(((1.0)/(float((1.0))+float(exp2((float(alu0)*float(((-1.4426950408889634)))))))))));
}`;

const E_32_6400n1 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 204800 */
  float val0 = texture(data1, vec2(float(float(int(float(idx0)+float((204800)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(float(idx0)+float((204800)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r;
  float val1 = float(texture(data2, vec2(float(float(int(float((idx0/(6400)))+float((32)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float((idx0/(6400)))+float((32)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
  float val2 = float(texture(data3, vec2(float(float(int(float((idx0/(6400)))+float((32)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(float((idx0/(6400)))+float((32)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val3 = float(texture(data4, vec2(float(float(int(float((idx0/(6400)))+float((32)))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(float((idx0/(6400)))+float((32)))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val4 = float(texture(data5, vec2(float(float(int(float((idx0/(6400)))+float((32)))%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(float((idx0/(6400)))+float((32)))/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float alu0 = float((float((float(float((val0-val1))*float(val2))*float(sqrt(((1.0)/(float(val3)+float((0.001))))))))+float(val4)));
  out_data = float((float(alu0)*float(((1.0)/(float((1.0))+float(exp2((float(alu0)*float(((-1.4426950408889634)))))))))));
}`;

const r_32_80_80_32_3_3 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 204800 */
  float acc0 = (0.0);
  for (int ridx0 = (0); ridx0 < (32); ++ridx0) {
    for (int ridx1 = (0); ridx1 < (3); ++ridx1) {
      for (int ridx2 = (0); ridx2 < (3); ++ridx2) {
        float val0 = bool((float(float(float(float(float((float((float(ridx2)*float(((-1)))))+float((float((int(idx0)%int((80))))*float(((-1)))))))<float((0))))*float(float(float((float(ridx2)+float((int(idx0)%int((80))))))<float((81)))))*float(float(float((float((float(ridx1)*float(((-1)))))+float((float((int((idx0/(80)))%int((80))))*float(((-1)))))))<float((0)))))*float(float(float((float(ridx1)+float((int((idx0/(80)))%int((80))))))<float((81))))))?(texture(data1, vec2(float(float(int(float(float(float(float(float(ridx2)+float((int(idx0)%int((80)))))+float((float(ridx1)*float((80)))))+float((float((int((idx0/(80)))%int((80))))*float((80)))))+float((float(ridx0)*float((6400)))))+float(((-81))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(float(float(float(float(float(ridx2)+float((int(idx0)%int((80)))))+float((float(ridx1)*float((80)))))+float((float((int((idx0/(80)))%int((80))))*float((80)))))+float((float(ridx0)*float((6400)))))+float(((-81))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):(0.0);
        float val1 = float(texture(data2, vec2(float(float(int(float(float(float((float(ridx0)*float((9))))+float((float(ridx1)*float((3)))))+float(ridx2))+float((float((idx0/(6400)))*float((288)))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(float(float((float(ridx0)*float((9))))+float((float(ridx1)*float((3)))))+float(ridx2))+float((float((idx0/(6400)))*float((288)))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
        acc0 = ((val0*val1)+acc0);
      }
    }
  }
  float val2 = float(texture(data3, vec2(float(float(int(idx0/(6400))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(idx0/(6400))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val3 = float(texture(data4, vec2(float(float(int(idx0/(6400))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(idx0/(6400))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val4 = float(texture(data5, vec2(float(float(int(idx0/(6400))%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(idx0/(6400))/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val5 = float(texture(data6, vec2(float(float(int(idx0/(6400))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(idx0/(6400))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  float alu0 = float((float((float(float((acc0-val2))*float(val3))*float(sqrt(((1.0)/(float(val4)+float((0.001))))))))+float(val5)));
  out_data = float((float(alu0)*float(((1.0)/(float((1.0))+float(exp2((float(alu0)*float(((-1.4426950408889634)))))))))));
}`;

const r_32_80_80_32_3_3n1 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
uniform sampler2D data7;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 204800 */
  float acc0 = (0.0);
  for (int ridx0 = (0); ridx0 < (32); ++ridx0) {
    for (int ridx1 = (0); ridx1 < (3); ++ridx1) {
      for (int ridx2 = (0); ridx2 < (3); ++ridx2) {
        float val0 = bool((float(float(float(float(float((float((float(ridx2)*float(((-1)))))+float((float((int(idx0)%int((80))))*float(((-1)))))))<float((0))))*float(float(float((float(ridx2)+float((int(idx0)%int((80))))))<float((81)))))*float(float(float((float((float(ridx1)*float(((-1)))))+float((float((int((idx0/(80)))%int((80))))*float(((-1)))))))<float((0)))))*float(float(float((float(ridx1)+float((int((idx0/(80)))%int((80))))))<float((81))))))?(texture(data2, vec2(float(float(int(float(float(float(float(float(ridx2)+float((int(idx0)%int((80)))))+float((float(ridx1)*float((80)))))+float((float((int((idx0/(80)))%int((80))))*float((80)))))+float((float(ridx0)*float((6400)))))+float(((-81))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(float(float(float(float(ridx2)+float((int(idx0)%int((80)))))+float((float(ridx1)*float((80)))))+float((float((int((idx0/(80)))%int((80))))*float((80)))))+float((float(ridx0)*float((6400)))))+float(((-81))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):(0.0);
        float val1 = float(texture(data3, vec2(float(float(int(float(float(float((float(ridx0)*float((9))))+float((float(ridx1)*float((3)))))+float(ridx2))+float((float((idx0/(6400)))*float((288)))))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(float(float(float((float(ridx0)*float((9))))+float((float(ridx1)*float((3)))))+float(ridx2))+float((float((idx0/(6400)))*float((288)))))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
        acc0 = ((val0*val1)+acc0);
      }
    }
  }
  float val2 = texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r;
  float val3 = float(texture(data4, vec2(float(float(int(idx0/(6400))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(idx0/(6400))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val4 = float(texture(data5, vec2(float(float(int(idx0/(6400))%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(idx0/(6400))/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val5 = float(texture(data6, vec2(float(float(int(idx0/(6400))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(idx0/(6400))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  float val6 = float(texture(data7, vec2(float(float(int(idx0/(6400))%textureSize(data7, 0).x) + 0.5f)/float(textureSize(data7, 0).x), float(float(int(idx0/(6400))/textureSize(data7, 0).x) + 0.5f)/float(textureSize(data7, 0).y))).r);
  float alu0 = float((float((float(float((acc0-val3))*float(val4))*float(sqrt(((1.0)/(float(val5)+float((0.001))))))))+float(val6)));
  out_data = float((float(val2)+float((float(alu0)*float(((1.0)/(float((1.0))+float(exp2((float(alu0)*float(((-1.4426950408889634)))))))))))));
}`;

const E_128_6400 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 819200 */
  float val0 = bool(float(float((idx0/(6400)))<float((32))))?(texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):(0.0);
  float val1 = bool((float(float(float((float((idx0/(6400)))*float(((-1)))))<float(((-31)))))*float(float(float((idx0/(6400)))<float((64))))))?(texture(data2, vec2(float(float(int(float(idx0)+float(((-204800))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(idx0)+float(((-204800))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):(0.0);
  float val2 = bool((float(float(float((float((idx0/(6400)))*float(((-1)))))<float(((-63)))))*float(float(float((idx0/(6400)))<float((96))))))?(texture(data3, vec2(float(float(int(float(idx0)+float(((-409600))))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(float(idx0)+float(((-409600))))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):(0.0);
  float val3 = bool(float(float((float((idx0/(6400)))*float(((-1)))))<float(((-95)))))?(texture(data4, vec2(float(float(int(float(idx0)+float(((-614400))))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(float(idx0)+float(((-614400))))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r):(0.0);
  out_data = float((float(float(float(val0)+float(val1))+float(val2))+float(val3)));
}`;

const r_64_6400_128 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 409600 */
  float acc0 = (0.0);
  for (int ridx0 = (0); ridx0 < (128); ++ridx0) {
    float val0 = texture(data1, vec2(float(float(int(float((float(ridx0)*float((6400))))+float((int(idx0)%int((6400)))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(float((float(ridx0)*float((6400))))+float((int(idx0)%int((6400)))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r;
    float val1 = float(texture(data2, vec2(float(float(int(float(ridx0)+float((float((idx0/(6400)))*float((128)))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(ridx0)+float((float((idx0/(6400)))*float((128)))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val0*val1)+acc0);
  }
  float val2 = float(texture(data3, vec2(float(float(int(idx0/(6400))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(idx0/(6400))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val3 = float(texture(data4, vec2(float(float(int(idx0/(6400))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(idx0/(6400))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val4 = float(texture(data5, vec2(float(float(int(idx0/(6400))%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(idx0/(6400))/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val5 = float(texture(data6, vec2(float(float(int(idx0/(6400))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(idx0/(6400))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  float alu0 = float((float((float(float((acc0-val2))*float(val3))*float(sqrt(((1.0)/(float(val4)+float((0.001))))))))+float(val5)));
  out_data = float((float(alu0)*float(((1.0)/(float((1.0))+float(exp2((float(alu0)*float(((-1.4426950408889634)))))))))));
}`;

const r_128_40_40_64_3_3 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 204800 */
  float acc0 = (0.0);
  for (int ridx0 = (0); ridx0 < (64); ++ridx0) {
    for (int ridx1 = (0); ridx1 < (3); ++ridx1) {
      for (int ridx2 = (0); ridx2 < (3); ++ridx2) {
        float val0 = bool((float(float(float((float((float(ridx2)*float(((-1)))))+float((float((int(idx0)%int((40))))*float(((-2)))))))<float((0))))*float(float(float((float((float(ridx1)*float(((-1)))))+float((float((int((idx0/(40)))%int((40))))*float(((-2)))))))<float((0))))))?(texture(data1, vec2(float(float(int(float(float(float(float(float(ridx2)+float((float((int(idx0)%int((40))))*float((2)))))+float((float(ridx1)*float((80)))))+float((float((int((idx0/(40)))%int((40))))*float((160)))))+float((float(ridx0)*float((6400)))))+float(((-81))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(float(float(float(float(float(ridx2)+float((float((int(idx0)%int((40))))*float((2)))))+float((float(ridx1)*float((80)))))+float((float((int((idx0/(40)))%int((40))))*float((160)))))+float((float(ridx0)*float((6400)))))+float(((-81))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):(0.0);
        float val1 = float(texture(data2, vec2(float(float(int(float(float(float((float(ridx0)*float((9))))+float((float(ridx1)*float((3)))))+float(ridx2))+float((float((idx0/(1600)))*float((576)))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(float(float((float(ridx0)*float((9))))+float((float(ridx1)*float((3)))))+float(ridx2))+float((float((idx0/(1600)))*float((576)))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
        acc0 = ((val0*val1)+acc0);
      }
    }
  }
  float val2 = float(texture(data3, vec2(float(float(int(idx0/(1600))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(idx0/(1600))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val3 = float(texture(data4, vec2(float(float(int(idx0/(1600))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(idx0/(1600))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val4 = float(texture(data5, vec2(float(float(int(idx0/(1600))%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(idx0/(1600))/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val5 = float(texture(data6, vec2(float(float(int(idx0/(1600))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(idx0/(1600))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  float alu0 = float((float((float(float((acc0-val2))*float(val3))*float(sqrt(((1.0)/(float(val4)+float((0.001))))))))+float(val5)));
  out_data = float((float(alu0)*float(((1.0)/(float((1.0))+float(exp2((float(alu0)*float(((-1.4426950408889634)))))))))));
}`;

const r_128_1600_128 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 204800 */
  float acc0 = (0.0);
  for (int ridx0 = (0); ridx0 < (128); ++ridx0) {
    float val0 = texture(data1, vec2(float(float(int(float((float(ridx0)*float((1600))))+float((int(idx0)%int((1600)))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(float((float(ridx0)*float((1600))))+float((int(idx0)%int((1600)))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r;
    float val1 = float(texture(data2, vec2(float(float(int(float(ridx0)+float((float((idx0/(1600)))*float((128)))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(ridx0)+float((float((idx0/(1600)))*float((128)))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val0*val1)+acc0);
  }
  out_data = float(acc0);
}`;

const E_64_1600 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 102400 */
  float val0 = texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r;
  float val1 = float(texture(data2, vec2(float(float(int(idx0/(1600))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(idx0/(1600))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
  float val2 = float(texture(data3, vec2(float(float(int(idx0/(1600))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(idx0/(1600))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val3 = float(texture(data4, vec2(float(float(int(idx0/(1600))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(idx0/(1600))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val4 = float(texture(data5, vec2(float(float(int(idx0/(1600))%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(idx0/(1600))/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float alu0 = float((float((float(float((val0-val1))*float(val2))*float(sqrt(((1.0)/(float(val3)+float((0.001))))))))+float(val4)));
  out_data = float((float(alu0)*float(((1.0)/(float((1.0))+float(exp2((float(alu0)*float(((-1.4426950408889634)))))))))));
}`;

const E_64_1600n1 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 102400 */
  float val0 = texture(data1, vec2(float(float(int(float(idx0)+float((102400)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(float(idx0)+float((102400)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r;
  float val1 = float(texture(data2, vec2(float(float(int(float((idx0/(1600)))+float((64)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float((idx0/(1600)))+float((64)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
  float val2 = float(texture(data3, vec2(float(float(int(float((idx0/(1600)))+float((64)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(float((idx0/(1600)))+float((64)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val3 = float(texture(data4, vec2(float(float(int(float((idx0/(1600)))+float((64)))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(float((idx0/(1600)))+float((64)))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val4 = float(texture(data5, vec2(float(float(int(float((idx0/(1600)))+float((64)))%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(float((idx0/(1600)))+float((64)))/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float alu0 = float((float((float(float((val0-val1))*float(val2))*float(sqrt(((1.0)/(float(val3)+float((0.001))))))))+float(val4)));
  out_data = float((float(alu0)*float(((1.0)/(float((1.0))+float(exp2((float(alu0)*float(((-1.4426950408889634)))))))))));
}`;

const r_64_40_40_64_3_3 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 102400 */
  float acc0 = (0.0);
  for (int ridx0 = (0); ridx0 < (64); ++ridx0) {
    for (int ridx1 = (0); ridx1 < (3); ++ridx1) {
      for (int ridx2 = (0); ridx2 < (3); ++ridx2) {
        float val0 = bool((float(float(float(float(float((float((float(ridx2)*float(((-1)))))+float((float((int(idx0)%int((40))))*float(((-1)))))))<float((0))))*float(float(float((float(ridx2)+float((int(idx0)%int((40))))))<float((41)))))*float(float(float((float((float(ridx1)*float(((-1)))))+float((float((int((idx0/(40)))%int((40))))*float(((-1)))))))<float((0)))))*float(float(float((float(ridx1)+float((int((idx0/(40)))%int((40))))))<float((41))))))?(texture(data1, vec2(float(float(int(float(float(float(float(float(ridx2)+float((int(idx0)%int((40)))))+float((float(ridx1)*float((40)))))+float((float((int((idx0/(40)))%int((40))))*float((40)))))+float((float(ridx0)*float((1600)))))+float(((-41))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(float(float(float(float(float(ridx2)+float((int(idx0)%int((40)))))+float((float(ridx1)*float((40)))))+float((float((int((idx0/(40)))%int((40))))*float((40)))))+float((float(ridx0)*float((1600)))))+float(((-41))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):(0.0);
        float val1 = float(texture(data2, vec2(float(float(int(float(float(float((float(ridx0)*float((9))))+float((float(ridx1)*float((3)))))+float(ridx2))+float((float((idx0/(1600)))*float((576)))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(float(float((float(ridx0)*float((9))))+float((float(ridx1)*float((3)))))+float(ridx2))+float((float((idx0/(1600)))*float((576)))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
        acc0 = ((val0*val1)+acc0);
      }
    }
  }
  float val2 = float(texture(data3, vec2(float(float(int(idx0/(1600))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(idx0/(1600))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val3 = float(texture(data4, vec2(float(float(int(idx0/(1600))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(idx0/(1600))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val4 = float(texture(data5, vec2(float(float(int(idx0/(1600))%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(idx0/(1600))/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val5 = float(texture(data6, vec2(float(float(int(idx0/(1600))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(idx0/(1600))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  float alu0 = float((float((float(float((acc0-val2))*float(val3))*float(sqrt(((1.0)/(float(val4)+float((0.001))))))))+float(val5)));
  out_data = float((float(alu0)*float(((1.0)/(float((1.0))+float(exp2((float(alu0)*float(((-1.4426950408889634)))))))))));
}`;

const r_64_40_40_64_3_3n1 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
uniform sampler2D data7;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 102400 */
  float acc0 = (0.0);
  for (int ridx0 = (0); ridx0 < (64); ++ridx0) {
    for (int ridx1 = (0); ridx1 < (3); ++ridx1) {
      for (int ridx2 = (0); ridx2 < (3); ++ridx2) {
        float val0 = bool((float(float(float(float(float((float((float(ridx2)*float(((-1)))))+float((float((int(idx0)%int((40))))*float(((-1)))))))<float((0))))*float(float(float((float(ridx2)+float((int(idx0)%int((40))))))<float((41)))))*float(float(float((float((float(ridx1)*float(((-1)))))+float((float((int((idx0/(40)))%int((40))))*float(((-1)))))))<float((0)))))*float(float(float((float(ridx1)+float((int((idx0/(40)))%int((40))))))<float((41))))))?(texture(data2, vec2(float(float(int(float(float(float(float(float(ridx2)+float((int(idx0)%int((40)))))+float((float(ridx1)*float((40)))))+float((float((int((idx0/(40)))%int((40))))*float((40)))))+float((float(ridx0)*float((1600)))))+float(((-41))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(float(float(float(float(ridx2)+float((int(idx0)%int((40)))))+float((float(ridx1)*float((40)))))+float((float((int((idx0/(40)))%int((40))))*float((40)))))+float((float(ridx0)*float((1600)))))+float(((-41))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):(0.0);
        float val1 = float(texture(data3, vec2(float(float(int(float(float(float((float(ridx0)*float((9))))+float((float(ridx1)*float((3)))))+float(ridx2))+float((float((idx0/(1600)))*float((576)))))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(float(float(float((float(ridx0)*float((9))))+float((float(ridx1)*float((3)))))+float(ridx2))+float((float((idx0/(1600)))*float((576)))))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
        acc0 = ((val0*val1)+acc0);
      }
    }
  }
  float val2 = texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r;
  float val3 = float(texture(data4, vec2(float(float(int(idx0/(1600))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(idx0/(1600))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val4 = float(texture(data5, vec2(float(float(int(idx0/(1600))%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(idx0/(1600))/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val5 = float(texture(data6, vec2(float(float(int(idx0/(1600))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(idx0/(1600))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  float val6 = float(texture(data7, vec2(float(float(int(idx0/(1600))%textureSize(data7, 0).x) + 0.5f)/float(textureSize(data7, 0).x), float(float(int(idx0/(1600))/textureSize(data7, 0).x) + 0.5f)/float(textureSize(data7, 0).y))).r);
  float alu0 = float((float((float(float((acc0-val3))*float(val4))*float(sqrt(((1.0)/(float(val5)+float((0.001))))))))+float(val6)));
  out_data = float((float(val2)+float((float(alu0)*float(((1.0)/(float((1.0))+float(exp2((float(alu0)*float(((-1.4426950408889634)))))))))))));
}`;

const E_256_1600 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 409600 */
  float val0 = bool(float(float((idx0/(1600)))<float((64))))?(texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):(0.0);
  float val1 = bool((float(float(float((float((idx0/(1600)))*float(((-1)))))<float(((-63)))))*float(float(float((idx0/(1600)))<float((128))))))?(texture(data2, vec2(float(float(int(float(idx0)+float(((-102400))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(idx0)+float(((-102400))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):(0.0);
  float val2 = bool((float(float(float((float((idx0/(1600)))*float(((-1)))))<float(((-127)))))*float(float(float((idx0/(1600)))<float((192))))))?(texture(data3, vec2(float(float(int(float(idx0)+float(((-204800))))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(float(idx0)+float(((-204800))))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):(0.0);
  float val3 = bool(float(float((float((idx0/(1600)))*float(((-1)))))<float(((-191)))))?(texture(data4, vec2(float(float(int(float(idx0)+float(((-307200))))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(float(idx0)+float(((-307200))))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r):(0.0);
  out_data = float((float(float(float(val0)+float(val1))+float(val2))+float(val3)));
}`;

const r_128_1600_256 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 204800 */
  float acc0 = (0.0);
  for (int ridx0 = (0); ridx0 < (256); ++ridx0) {
    float val0 = texture(data1, vec2(float(float(int(float((float(ridx0)*float((1600))))+float((int(idx0)%int((1600)))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(float((float(ridx0)*float((1600))))+float((int(idx0)%int((1600)))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r;
    float val1 = float(texture(data2, vec2(float(float(int(float(ridx0)+float((float((idx0/(1600)))*float((256)))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(ridx0)+float((float((idx0/(1600)))*float((256)))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val0*val1)+acc0);
  }
  float val2 = float(texture(data3, vec2(float(float(int(idx0/(1600))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(idx0/(1600))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val3 = float(texture(data4, vec2(float(float(int(idx0/(1600))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(idx0/(1600))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val4 = float(texture(data5, vec2(float(float(int(idx0/(1600))%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(idx0/(1600))/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val5 = float(texture(data6, vec2(float(float(int(idx0/(1600))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(idx0/(1600))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  float alu0 = float((float((float(float((acc0-val2))*float(val3))*float(sqrt(((1.0)/(float(val4)+float((0.001))))))))+float(val5)));
  out_data = float((float(alu0)*float(((1.0)/(float((1.0))+float(exp2((float(alu0)*float(((-1.4426950408889634)))))))))));
}`;

const r_256_20_20_128_3_3 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 102400 */
  float acc0 = (0.0);
  for (int ridx0 = (0); ridx0 < (128); ++ridx0) {
    for (int ridx1 = (0); ridx1 < (3); ++ridx1) {
      for (int ridx2 = (0); ridx2 < (3); ++ridx2) {
        float val0 = bool((float(float(float((float((float(ridx2)*float(((-1)))))+float((float((int(idx0)%int((20))))*float(((-2)))))))<float((0))))*float(float(float((float((float(ridx1)*float(((-1)))))+float((float((int((idx0/(20)))%int((20))))*float(((-2)))))))<float((0))))))?(texture(data1, vec2(float(float(int(float(float(float(float(float(ridx2)+float((float((int(idx0)%int((20))))*float((2)))))+float((float(ridx1)*float((40)))))+float((float((int((idx0/(20)))%int((20))))*float((80)))))+float((float(ridx0)*float((1600)))))+float(((-41))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(float(float(float(float(float(ridx2)+float((float((int(idx0)%int((20))))*float((2)))))+float((float(ridx1)*float((40)))))+float((float((int((idx0/(20)))%int((20))))*float((80)))))+float((float(ridx0)*float((1600)))))+float(((-41))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):(0.0);
        float val1 = float(texture(data2, vec2(float(float(int(float(float(float((float(ridx0)*float((9))))+float((float(ridx1)*float((3)))))+float(ridx2))+float((float((idx0/(400)))*float((1152)))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(float(float((float(ridx0)*float((9))))+float((float(ridx1)*float((3)))))+float(ridx2))+float((float((idx0/(400)))*float((1152)))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
        acc0 = ((val0*val1)+acc0);
      }
    }
  }
  float val2 = float(texture(data3, vec2(float(float(int(idx0/(400))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(idx0/(400))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val3 = float(texture(data4, vec2(float(float(int(idx0/(400))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(idx0/(400))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val4 = float(texture(data5, vec2(float(float(int(idx0/(400))%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(idx0/(400))/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val5 = float(texture(data6, vec2(float(float(int(idx0/(400))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(idx0/(400))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  float alu0 = float((float((float(float((acc0-val2))*float(val3))*float(sqrt(((1.0)/(float(val4)+float((0.001))))))))+float(val5)));
  out_data = float((float(alu0)*float(((1.0)/(float((1.0))+float(exp2((float(alu0)*float(((-1.4426950408889634)))))))))));
}`;

const r_256_400_256 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 102400 */
  float acc0 = (0.0);
  for (int ridx0 = (0); ridx0 < (256); ++ridx0) {
    float val0 = texture(data1, vec2(float(float(int(float((float(ridx0)*float((400))))+float((int(idx0)%int((400)))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(float((float(ridx0)*float((400))))+float((int(idx0)%int((400)))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r;
    float val1 = float(texture(data2, vec2(float(float(int(float(ridx0)+float((float((idx0/(400)))*float((256)))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(ridx0)+float((float((idx0/(400)))*float((256)))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val0*val1)+acc0);
  }
  out_data = float(acc0);
}`;

const E_128_400 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 51200 */
  float val0 = texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r;
  float val1 = float(texture(data2, vec2(float(float(int(idx0/(400))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(idx0/(400))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
  float val2 = float(texture(data3, vec2(float(float(int(idx0/(400))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(idx0/(400))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val3 = float(texture(data4, vec2(float(float(int(idx0/(400))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(idx0/(400))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val4 = float(texture(data5, vec2(float(float(int(idx0/(400))%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(idx0/(400))/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float alu0 = float((float((float(float((val0-val1))*float(val2))*float(sqrt(((1.0)/(float(val3)+float((0.001))))))))+float(val4)));
  out_data = float((float(alu0)*float(((1.0)/(float((1.0))+float(exp2((float(alu0)*float(((-1.4426950408889634)))))))))));
}`;

const E_128_400n1 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 51200 */
  float val0 = texture(data1, vec2(float(float(int(float(idx0)+float((51200)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(float(idx0)+float((51200)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r;
  float val1 = float(texture(data2, vec2(float(float(int(float((idx0/(400)))+float((128)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float((idx0/(400)))+float((128)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
  float val2 = float(texture(data3, vec2(float(float(int(float((idx0/(400)))+float((128)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(float((idx0/(400)))+float((128)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val3 = float(texture(data4, vec2(float(float(int(float((idx0/(400)))+float((128)))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(float((idx0/(400)))+float((128)))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val4 = float(texture(data5, vec2(float(float(int(float((idx0/(400)))+float((128)))%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(float((idx0/(400)))+float((128)))/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float alu0 = float((float((float(float((val0-val1))*float(val2))*float(sqrt(((1.0)/(float(val3)+float((0.001))))))))+float(val4)));
  out_data = float((float(alu0)*float(((1.0)/(float((1.0))+float(exp2((float(alu0)*float(((-1.4426950408889634)))))))))));
}`;

const r_128_20_20_128_3_3 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 51200 */
  float acc0 = (0.0);
  for (int ridx0 = (0); ridx0 < (128); ++ridx0) {
    for (int ridx1 = (0); ridx1 < (3); ++ridx1) {
      for (int ridx2 = (0); ridx2 < (3); ++ridx2) {
        float val0 = bool((float(float(float(float(float((float((float(ridx2)*float(((-1)))))+float((float((int(idx0)%int((20))))*float(((-1)))))))<float((0))))*float(float(float((float(ridx2)+float((int(idx0)%int((20))))))<float((21)))))*float(float(float((float((float(ridx1)*float(((-1)))))+float((float((int((idx0/(20)))%int((20))))*float(((-1)))))))<float((0)))))*float(float(float((float(ridx1)+float((int((idx0/(20)))%int((20))))))<float((21))))))?(texture(data1, vec2(float(float(int(float(float(float(float(float(ridx2)+float((int(idx0)%int((20)))))+float((float(ridx1)*float((20)))))+float((float((int((idx0/(20)))%int((20))))*float((20)))))+float((float(ridx0)*float((400)))))+float(((-21))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(float(float(float(float(float(ridx2)+float((int(idx0)%int((20)))))+float((float(ridx1)*float((20)))))+float((float((int((idx0/(20)))%int((20))))*float((20)))))+float((float(ridx0)*float((400)))))+float(((-21))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):(0.0);
        float val1 = float(texture(data2, vec2(float(float(int(float(float(float((float(ridx0)*float((9))))+float((float(ridx1)*float((3)))))+float(ridx2))+float((float((idx0/(400)))*float((1152)))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(float(float((float(ridx0)*float((9))))+float((float(ridx1)*float((3)))))+float(ridx2))+float((float((idx0/(400)))*float((1152)))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
        acc0 = ((val0*val1)+acc0);
      }
    }
  }
  float val2 = float(texture(data3, vec2(float(float(int(idx0/(400))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(idx0/(400))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val3 = float(texture(data4, vec2(float(float(int(idx0/(400))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(idx0/(400))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val4 = float(texture(data5, vec2(float(float(int(idx0/(400))%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(idx0/(400))/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val5 = float(texture(data6, vec2(float(float(int(idx0/(400))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(idx0/(400))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  float alu0 = float((float((float(float((acc0-val2))*float(val3))*float(sqrt(((1.0)/(float(val4)+float((0.001))))))))+float(val5)));
  out_data = float((float(alu0)*float(((1.0)/(float((1.0))+float(exp2((float(alu0)*float(((-1.4426950408889634)))))))))));
}`;

const r_128_20_20_128_3_3n1 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
uniform sampler2D data7;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 51200 */
  float acc0 = (0.0);
  for (int ridx0 = (0); ridx0 < (128); ++ridx0) {
    for (int ridx1 = (0); ridx1 < (3); ++ridx1) {
      for (int ridx2 = (0); ridx2 < (3); ++ridx2) {
        float val0 = bool((float(float(float(float(float((float((float(ridx2)*float(((-1)))))+float((float((int(idx0)%int((20))))*float(((-1)))))))<float((0))))*float(float(float((float(ridx2)+float((int(idx0)%int((20))))))<float((21)))))*float(float(float((float((float(ridx1)*float(((-1)))))+float((float((int((idx0/(20)))%int((20))))*float(((-1)))))))<float((0)))))*float(float(float((float(ridx1)+float((int((idx0/(20)))%int((20))))))<float((21))))))?(texture(data2, vec2(float(float(int(float(float(float(float(float(ridx2)+float((int(idx0)%int((20)))))+float((float(ridx1)*float((20)))))+float((float((int((idx0/(20)))%int((20))))*float((20)))))+float((float(ridx0)*float((400)))))+float(((-21))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(float(float(float(float(ridx2)+float((int(idx0)%int((20)))))+float((float(ridx1)*float((20)))))+float((float((int((idx0/(20)))%int((20))))*float((20)))))+float((float(ridx0)*float((400)))))+float(((-21))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):(0.0);
        float val1 = float(texture(data3, vec2(float(float(int(float(float(float((float(ridx0)*float((9))))+float((float(ridx1)*float((3)))))+float(ridx2))+float((float((idx0/(400)))*float((1152)))))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(float(float(float((float(ridx0)*float((9))))+float((float(ridx1)*float((3)))))+float(ridx2))+float((float((idx0/(400)))*float((1152)))))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
        acc0 = ((val0*val1)+acc0);
      }
    }
  }
  float val2 = texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r;
  float val3 = float(texture(data4, vec2(float(float(int(idx0/(400))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(idx0/(400))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val4 = float(texture(data5, vec2(float(float(int(idx0/(400))%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(idx0/(400))/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val5 = float(texture(data6, vec2(float(float(int(idx0/(400))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(idx0/(400))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  float val6 = float(texture(data7, vec2(float(float(int(idx0/(400))%textureSize(data7, 0).x) + 0.5f)/float(textureSize(data7, 0).x), float(float(int(idx0/(400))/textureSize(data7, 0).x) + 0.5f)/float(textureSize(data7, 0).y))).r);
  float alu0 = float((float((float(float((acc0-val3))*float(val4))*float(sqrt(((1.0)/(float(val5)+float((0.001))))))))+float(val6)));
  out_data = float((float(val2)+float((float(alu0)*float(((1.0)/(float((1.0))+float(exp2((float(alu0)*float(((-1.4426950408889634)))))))))))));
}`;

const E_384_400 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 153600 */
  float val0 = bool(float(float((idx0/(400)))<float((128))))?(texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):(0.0);
  float val1 = bool((float(float(float((float((idx0/(400)))*float(((-1)))))<float(((-127)))))*float(float(float((idx0/(400)))<float((256))))))?(texture(data2, vec2(float(float(int(float(idx0)+float(((-51200))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(idx0)+float(((-51200))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):(0.0);
  float val2 = bool(float(float((float((idx0/(400)))*float(((-1)))))<float(((-255)))))?(texture(data3, vec2(float(float(int(float(idx0)+float(((-102400))))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(float(idx0)+float(((-102400))))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):(0.0);
  out_data = float((float(float(val0)+float(val1))+float(val2)));
}`;

const r_256_400_384 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 102400 */
  float acc0 = (0.0);
  for (int ridx0 = (0); ridx0 < (384); ++ridx0) {
    float val0 = texture(data1, vec2(float(float(int(float((float(ridx0)*float((400))))+float((int(idx0)%int((400)))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(float((float(ridx0)*float((400))))+float((int(idx0)%int((400)))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r;
    float val1 = float(texture(data2, vec2(float(float(int(float(ridx0)+float((float((idx0/(400)))*float((384)))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(ridx0)+float((float((idx0/(400)))*float((384)))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val0*val1)+acc0);
  }
  float val2 = float(texture(data3, vec2(float(float(int(idx0/(400))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(idx0/(400))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val3 = float(texture(data4, vec2(float(float(int(idx0/(400))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(idx0/(400))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val4 = float(texture(data5, vec2(float(float(int(idx0/(400))%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(idx0/(400))/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val5 = float(texture(data6, vec2(float(float(int(idx0/(400))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(idx0/(400))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  float alu0 = float((float((float(float((acc0-val2))*float(val3))*float(sqrt(((1.0)/(float(val4)+float((0.001))))))))+float(val5)));
  out_data = float((float(alu0)*float(((1.0)/(float((1.0))+float(exp2((float(alu0)*float(((-1.4426950408889634)))))))))));
}`;

const r_128_400_256 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 51200 */
  float acc0 = (0.0);
  for (int ridx0 = (0); ridx0 < (256); ++ridx0) {
    float val0 = texture(data1, vec2(float(float(int(float((float(ridx0)*float((400))))+float((int(idx0)%int((400)))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(float((float(ridx0)*float((400))))+float((int(idx0)%int((400)))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r;
    float val1 = float(texture(data2, vec2(float(float(int(float(ridx0)+float((float((idx0/(400)))*float((256)))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(ridx0)+float((float((idx0/(400)))*float((256)))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val0*val1)+acc0);
  }
  float val2 = float(texture(data3, vec2(float(float(int(idx0/(400))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(idx0/(400))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val3 = float(texture(data4, vec2(float(float(int(idx0/(400))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(idx0/(400))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val4 = float(texture(data5, vec2(float(float(int(idx0/(400))%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(idx0/(400))/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val5 = float(texture(data6, vec2(float(float(int(idx0/(400))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(idx0/(400))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  float alu0 = float((float((float(float((acc0-val2))*float(val3))*float(sqrt(((1.0)/(float(val4)+float((0.001))))))))+float(val5)));
  out_data = float((float(alu0)*float(((1.0)/(float((1.0))+float(exp2((float(alu0)*float(((-1.4426950408889634)))))))))));
}`;

const r_128_20_20_5_5 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 51200 */
  float acc0 = -(1./0.);
  for (int ridx0 = (0); ridx0 < (5); ++ridx0) {
    for (int ridx1 = (0); ridx1 < (5); ++ridx1) {
      float val0 = bool((float(float(float(float(float((float((float(ridx1)*float(((-1)))))+float((float((int(idx0)%int((20))))*float(((-1)))))))<float(((-1)))))*float(float(float((float(ridx1)+float((int(idx0)%int((20))))))<float((22)))))*float(float(float((float((float(ridx0)*float(((-1)))))+float((float((int((idx0/(20)))%int((20))))*float(((-1)))))))<float(((-1))))))*float(float(float((float(ridx0)+float((int((idx0/(20)))%int((20))))))<float((22))))))?(texture(data1, vec2(float(float(int(float(float(float(float(float(ridx1)+float((int(idx0)%int((20)))))+float((float(ridx0)*float((20)))))+float((float((int((idx0/(20)))%int((20))))*float((20)))))+float((float((idx0/(400)))*float((400)))))+float(((-42))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(float(float(float(float(float(ridx1)+float((int(idx0)%int((20)))))+float((float(ridx0)*float((20)))))+float((float((int((idx0/(20)))%int((20))))*float((20)))))+float((float((idx0/(400)))*float((400)))))+float(((-42))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):(0.0);
      float alu0 = float(max(val0,acc0));
      acc0 = alu0;
    }
  }
  out_data = float(acc0);
}`;

const E_512_400 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 204800 */
  float val0 = bool(float(float((idx0/(400)))<float((128))))?(texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):(0.0);
  float val1 = bool((float(float(float((float((idx0/(400)))*float(((-1)))))<float(((-127)))))*float(float(float((idx0/(400)))<float((256))))))?(texture(data2, vec2(float(float(int(float(idx0)+float(((-51200))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(idx0)+float(((-51200))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):(0.0);
  float val2 = bool((float(float(float((float((idx0/(400)))*float(((-1)))))<float(((-255)))))*float(float(float((idx0/(400)))<float((384))))))?(texture(data3, vec2(float(float(int(float(idx0)+float(((-102400))))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(float(idx0)+float(((-102400))))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):(0.0);
  float val3 = bool(float(float((float((idx0/(400)))*float(((-1)))))<float(((-383)))))?(texture(data4, vec2(float(float(int(float(idx0)+float(((-153600))))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(float(idx0)+float(((-153600))))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r):(0.0);
  out_data = float((float(float(float(val0)+float(val1))+float(val2))+float(val3)));
}`;

const r_256_400_512 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 102400 */
  float acc0 = (0.0);
  for (int ridx0 = (0); ridx0 < (512); ++ridx0) {
    float val0 = texture(data1, vec2(float(float(int(float((float(ridx0)*float((400))))+float((int(idx0)%int((400)))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(float((float(ridx0)*float((400))))+float((int(idx0)%int((400)))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r;
    float val1 = float(texture(data2, vec2(float(float(int(float(ridx0)+float((float((idx0/(400)))*float((512)))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(ridx0)+float((float((idx0/(400)))*float((512)))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val0*val1)+acc0);
  }
  float val2 = float(texture(data3, vec2(float(float(int(idx0/(400))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(idx0/(400))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val3 = float(texture(data4, vec2(float(float(int(idx0/(400))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(idx0/(400))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val4 = float(texture(data5, vec2(float(float(int(idx0/(400))%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(idx0/(400))/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val5 = float(texture(data6, vec2(float(float(int(idx0/(400))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(idx0/(400))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  float alu0 = float((float((float(float((acc0-val2))*float(val3))*float(sqrt(((1.0)/(float(val4)+float((0.001))))))))+float(val5)));
  out_data = float((float(alu0)*float(((1.0)/(float((1.0))+float(exp2((float(alu0)*float(((-1.4426950408889634)))))))))));
}`;

const E_384_40_40 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 614400 */
  bool alu0 = bool(float(float((idx0/(1600)))<float((256))));
  float val0 = bool(alu0)?(texture(data1, vec2(float(float(int(float((int((idx0/(2)))%int((20))))+float((float((int((idx0/(80)))%int((5120))))*float((20)))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(float((int((idx0/(2)))%int((20))))+float((float((int((idx0/(80)))%int((5120))))*float((20)))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):(0.0);
  float val1 = bool(float(float((float((idx0/(1600)))*float(((-1)))))<float(((-255)))))?(texture(data2, vec2(float(float(int(float(idx0)+float(((-409600))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(idx0)+float(((-409600))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):(0.0);
  out_data = float((float((float(val0)*float((float(alu0)!=0.0?(1.0):(0.0)))))+float(val1)));
}`;

const r_128_1600_384 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 204800 */
  float acc0 = (0.0);
  for (int ridx0 = (0); ridx0 < (384); ++ridx0) {
    float val0 = texture(data1, vec2(float(float(int(float((float(ridx0)*float((1600))))+float((int(idx0)%int((1600)))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(float((float(ridx0)*float((1600))))+float((int(idx0)%int((1600)))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r;
    float val1 = float(texture(data2, vec2(float(float(int(float(ridx0)+float((float((idx0/(1600)))*float((384)))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(ridx0)+float((float((idx0/(1600)))*float((384)))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val0*val1)+acc0);
  }
  out_data = float(acc0);
}`;

const E_192_1600 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 307200 */
  float val0 = bool(float(float((idx0/(1600)))<float((64))))?(texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):(0.0);
  float val1 = bool((float(float(float((float((idx0/(1600)))*float(((-1)))))<float(((-63)))))*float(float(float((idx0/(1600)))<float((128))))))?(texture(data2, vec2(float(float(int(float(idx0)+float(((-102400))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(idx0)+float(((-102400))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):(0.0);
  float val2 = bool(float(float((float((idx0/(1600)))*float(((-1)))))<float(((-127)))))?(texture(data3, vec2(float(float(int(float(idx0)+float(((-204800))))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(float(idx0)+float(((-204800))))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):(0.0);
  out_data = float((float(float(val0)+float(val1))+float(val2)));
}`;

const r_128_1600_192 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 204800 */
  float acc0 = (0.0);
  for (int ridx0 = (0); ridx0 < (192); ++ridx0) {
    float val0 = texture(data1, vec2(float(float(int(float((float(ridx0)*float((1600))))+float((int(idx0)%int((1600)))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(float((float(ridx0)*float((1600))))+float((int(idx0)%int((1600)))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r;
    float val1 = float(texture(data2, vec2(float(float(int(float(ridx0)+float((float((idx0/(1600)))*float((192)))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(ridx0)+float((float((idx0/(1600)))*float((192)))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val0*val1)+acc0);
  }
  float val2 = float(texture(data3, vec2(float(float(int(idx0/(1600))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(idx0/(1600))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val3 = float(texture(data4, vec2(float(float(int(idx0/(1600))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(idx0/(1600))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val4 = float(texture(data5, vec2(float(float(int(idx0/(1600))%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(idx0/(1600))/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val5 = float(texture(data6, vec2(float(float(int(idx0/(1600))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(idx0/(1600))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  float alu0 = float((float((float(float((acc0-val2))*float(val3))*float(sqrt(((1.0)/(float(val4)+float((0.001))))))))+float(val5)));
  out_data = float((float(alu0)*float(((1.0)/(float((1.0))+float(exp2((float(alu0)*float(((-1.4426950408889634)))))))))));
}`;

const E_192_80_80 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 1228800 */
  bool alu0 = bool(float(float((idx0/(6400)))<float((128))));
  float val0 = bool(alu0)?(texture(data1, vec2(float(float(int(float((int((idx0/(2)))%int((40))))+float((float((int((idx0/(160)))%int((5120))))*float((40)))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(float((int((idx0/(2)))%int((40))))+float((float((int((idx0/(160)))%int((5120))))*float((40)))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):(0.0);
  float val1 = bool(float(float((float((idx0/(6400)))*float(((-1)))))<float(((-127)))))?(texture(data2, vec2(float(float(int(float(idx0)+float(((-819200))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(idx0)+float(((-819200))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):(0.0);
  out_data = float((float((float(val0)*float((float(alu0)!=0.0?(1.0):(0.0)))))+float(val1)));
}`;

const r_64_6400_192 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 409600 */
  float acc0 = (0.0);
  for (int ridx0 = (0); ridx0 < (192); ++ridx0) {
    float val0 = texture(data1, vec2(float(float(int(float((float(ridx0)*float((6400))))+float((int(idx0)%int((6400)))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(float((float(ridx0)*float((6400))))+float((int(idx0)%int((6400)))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r;
    float val1 = float(texture(data2, vec2(float(float(int(float(ridx0)+float((float((idx0/(6400)))*float((192)))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(ridx0)+float((float((idx0/(6400)))*float((192)))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val0*val1)+acc0);
  }
  out_data = float(acc0);
}`;

const E_96_6400 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 614400 */
  float val0 = bool(float(float((idx0/(6400)))<float((32))))?(texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):(0.0);
  float val1 = bool((float(float(float((float((idx0/(6400)))*float(((-1)))))<float(((-31)))))*float(float(float((idx0/(6400)))<float((64))))))?(texture(data2, vec2(float(float(int(float(idx0)+float(((-204800))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(idx0)+float(((-204800))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):(0.0);
  float val2 = bool(float(float((float((idx0/(6400)))*float(((-1)))))<float(((-63)))))?(texture(data3, vec2(float(float(int(float(idx0)+float(((-409600))))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(float(idx0)+float(((-409600))))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):(0.0);
  out_data = float((float(float(val0)+float(val1))+float(val2)));
}`;

const r_64_6400_96 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 409600 */
  float acc0 = (0.0);
  for (int ridx0 = (0); ridx0 < (96); ++ridx0) {
    float val0 = texture(data1, vec2(float(float(int(float((float(ridx0)*float((6400))))+float((int(idx0)%int((6400)))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(float((float(ridx0)*float((6400))))+float((int(idx0)%int((6400)))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r;
    float val1 = float(texture(data2, vec2(float(float(int(float(ridx0)+float((float((idx0/(6400)))*float((96)))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(ridx0)+float((float((idx0/(6400)))*float((96)))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val0*val1)+acc0);
  }
  float val2 = float(texture(data3, vec2(float(float(int(idx0/(6400))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(idx0/(6400))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val3 = float(texture(data4, vec2(float(float(int(idx0/(6400))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(idx0/(6400))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val4 = float(texture(data5, vec2(float(float(int(idx0/(6400))%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(idx0/(6400))/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val5 = float(texture(data6, vec2(float(float(int(idx0/(6400))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(idx0/(6400))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  float alu0 = float((float((float(float((acc0-val2))*float(val3))*float(sqrt(((1.0)/(float(val4)+float((0.001))))))))+float(val5)));
  out_data = float((float(alu0)*float(((1.0)/(float((1.0))+float(exp2((float(alu0)*float(((-1.4426950408889634)))))))))));
}`;

const r_64_80_80_64_3_3 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 409600 */
  float acc0 = (0.0);
  for (int ridx0 = (0); ridx0 < (64); ++ridx0) {
    for (int ridx1 = (0); ridx1 < (3); ++ridx1) {
      for (int ridx2 = (0); ridx2 < (3); ++ridx2) {
        float val0 = bool((float(float(float(float(float((float((float(ridx2)*float(((-1)))))+float((float((int(idx0)%int((80))))*float(((-1)))))))<float((0))))*float(float(float((float(ridx2)+float((int(idx0)%int((80))))))<float((81)))))*float(float(float((float((float(ridx1)*float(((-1)))))+float((float((int((idx0/(80)))%int((80))))*float(((-1)))))))<float((0)))))*float(float(float((float(ridx1)+float((int((idx0/(80)))%int((80))))))<float((81))))))?(texture(data1, vec2(float(float(int(float(float(float(float(float(ridx2)+float((int(idx0)%int((80)))))+float((float(ridx1)*float((80)))))+float((float((int((idx0/(80)))%int((80))))*float((80)))))+float((float(ridx0)*float((6400)))))+float(((-81))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(float(float(float(float(float(ridx2)+float((int(idx0)%int((80)))))+float((float(ridx1)*float((80)))))+float((float((int((idx0/(80)))%int((80))))*float((80)))))+float((float(ridx0)*float((6400)))))+float(((-81))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):(0.0);
        float val1 = float(texture(data2, vec2(float(float(int(float(float(float((float(ridx0)*float((9))))+float((float(ridx1)*float((3)))))+float(ridx2))+float((float((idx0/(6400)))*float((576)))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(float(float((float(ridx0)*float((9))))+float((float(ridx1)*float((3)))))+float(ridx2))+float((float((idx0/(6400)))*float((576)))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
        acc0 = ((val0*val1)+acc0);
      }
    }
  }
  float val2 = float(texture(data3, vec2(float(float(int(idx0/(6400))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(idx0/(6400))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val3 = float(texture(data4, vec2(float(float(int(idx0/(6400))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(idx0/(6400))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val4 = float(texture(data5, vec2(float(float(int(idx0/(6400))%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(idx0/(6400))/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val5 = float(texture(data6, vec2(float(float(int(idx0/(6400))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(idx0/(6400))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  float alu0 = float((float((float(float((acc0-val2))*float(val3))*float(sqrt(((1.0)/(float(val4)+float((0.001))))))))+float(val5)));
  out_data = float((float(alu0)*float(((1.0)/(float((1.0))+float(exp2((float(alu0)*float(((-1.4426950408889634)))))))))));
}`;

const r_80_80_80_64_3_3 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 512000 */
  float acc0 = (0.0);
  for (int ridx0 = (0); ridx0 < (64); ++ridx0) {
    for (int ridx1 = (0); ridx1 < (3); ++ridx1) {
      for (int ridx2 = (0); ridx2 < (3); ++ridx2) {
        float val0 = bool((float(float(float(float(float((float((float(ridx2)*float(((-1)))))+float((float((int(idx0)%int((80))))*float(((-1)))))))<float((0))))*float(float(float((float(ridx2)+float((int(idx0)%int((80))))))<float((81)))))*float(float(float((float((float(ridx1)*float(((-1)))))+float((float((int((idx0/(80)))%int((80))))*float(((-1)))))))<float((0)))))*float(float(float((float(ridx1)+float((int((idx0/(80)))%int((80))))))<float((81))))))?(texture(data1, vec2(float(float(int(float(float(float(float(float(ridx2)+float((int(idx0)%int((80)))))+float((float(ridx1)*float((80)))))+float((float((int((idx0/(80)))%int((80))))*float((80)))))+float((float(ridx0)*float((6400)))))+float(((-81))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(float(float(float(float(float(ridx2)+float((int(idx0)%int((80)))))+float((float(ridx1)*float((80)))))+float((float((int((idx0/(80)))%int((80))))*float((80)))))+float((float(ridx0)*float((6400)))))+float(((-81))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):(0.0);
        float val1 = float(texture(data2, vec2(float(float(int(float(float(float((float(ridx0)*float((9))))+float((float(ridx1)*float((3)))))+float(ridx2))+float((float((idx0/(6400)))*float((576)))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(float(float((float(ridx0)*float((9))))+float((float(ridx1)*float((3)))))+float(ridx2))+float((float((idx0/(6400)))*float((576)))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
        acc0 = ((val0*val1)+acc0);
      }
    }
  }
  float val2 = float(texture(data3, vec2(float(float(int(idx0/(6400))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(idx0/(6400))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val3 = float(texture(data4, vec2(float(float(int(idx0/(6400))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(idx0/(6400))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val4 = float(texture(data5, vec2(float(float(int(idx0/(6400))%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(idx0/(6400))/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val5 = float(texture(data6, vec2(float(float(int(idx0/(6400))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(idx0/(6400))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  float alu0 = float((float((float(float((acc0-val2))*float(val3))*float(sqrt(((1.0)/(float(val4)+float((0.001))))))))+float(val5)));
  out_data = float((float(alu0)*float(((1.0)/(float((1.0))+float(exp2((float(alu0)*float(((-1.4426950408889634)))))))))));
}`;

const r_80_80_80_80_3_3 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 512000 */
  float acc0 = (0.0);
  for (int ridx0 = (0); ridx0 < (80); ++ridx0) {
    for (int ridx1 = (0); ridx1 < (3); ++ridx1) {
      for (int ridx2 = (0); ridx2 < (3); ++ridx2) {
        float val0 = bool((float(float(float(float(float((float((float(ridx2)*float(((-1)))))+float((float((int(idx0)%int((80))))*float(((-1)))))))<float((0))))*float(float(float((float(ridx2)+float((int(idx0)%int((80))))))<float((81)))))*float(float(float((float((float(ridx1)*float(((-1)))))+float((float((int((idx0/(80)))%int((80))))*float(((-1)))))))<float((0)))))*float(float(float((float(ridx1)+float((int((idx0/(80)))%int((80))))))<float((81))))))?(texture(data1, vec2(float(float(int(float(float(float(float(float(ridx2)+float((int(idx0)%int((80)))))+float((float(ridx1)*float((80)))))+float((float((int((idx0/(80)))%int((80))))*float((80)))))+float((float(ridx0)*float((6400)))))+float(((-81))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(float(float(float(float(float(ridx2)+float((int(idx0)%int((80)))))+float((float(ridx1)*float((80)))))+float((float((int((idx0/(80)))%int((80))))*float((80)))))+float((float(ridx0)*float((6400)))))+float(((-81))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):(0.0);
        float val1 = float(texture(data2, vec2(float(float(int(float(float(float((float(ridx0)*float((9))))+float((float(ridx1)*float((3)))))+float(ridx2))+float((float((idx0/(6400)))*float((720)))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(float(float((float(ridx0)*float((9))))+float((float(ridx1)*float((3)))))+float(ridx2))+float((float((idx0/(6400)))*float((720)))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
        acc0 = ((val0*val1)+acc0);
      }
    }
  }
  float val2 = float(texture(data3, vec2(float(float(int(idx0/(6400))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(idx0/(6400))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val3 = float(texture(data4, vec2(float(float(int(idx0/(6400))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(idx0/(6400))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val4 = float(texture(data5, vec2(float(float(int(idx0/(6400))%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(idx0/(6400))/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val5 = float(texture(data6, vec2(float(float(int(idx0/(6400))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(idx0/(6400))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  float alu0 = float((float((float(float((acc0-val2))*float(val3))*float(sqrt(((1.0)/(float(val4)+float((0.001))))))))+float(val5)));
  out_data = float((float(alu0)*float(((1.0)/(float((1.0))+float(exp2((float(alu0)*float(((-1.4426950408889634)))))))))));
}`;

const r_80_6400_80 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 512000 */
  float acc0 = (0.0);
  for (int ridx0 = (0); ridx0 < (80); ++ridx0) {
    float val0 = texture(data1, vec2(float(float(int(float((float(ridx0)*float((6400))))+float((int(idx0)%int((6400)))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(float((float(ridx0)*float((6400))))+float((int(idx0)%int((6400)))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r;
    float val1 = float(texture(data2, vec2(float(float(int(float(ridx0)+float((float((idx0/(6400)))*float((80)))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(ridx0)+float((float((idx0/(6400)))*float((80)))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val0*val1)+acc0);
  }
  out_data = float(acc0);
}`;

const r_64_40_40_64_3_3n2 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 102400 */
  float acc0 = (0.0);
  for (int ridx0 = (0); ridx0 < (64); ++ridx0) {
    for (int ridx1 = (0); ridx1 < (3); ++ridx1) {
      for (int ridx2 = (0); ridx2 < (3); ++ridx2) {
        float val0 = bool((float(float(float((float((float(ridx2)*float(((-1)))))+float((float((int(idx0)%int((40))))*float(((-2)))))))<float((0))))*float(float(float((float((float(ridx1)*float(((-1)))))+float((float((int((idx0/(40)))%int((40))))*float(((-2)))))))<float((0))))))?(texture(data1, vec2(float(float(int(float(float(float(float(float(ridx2)+float((float((int(idx0)%int((40))))*float((2)))))+float((float(ridx1)*float((80)))))+float((float((int((idx0/(40)))%int((40))))*float((160)))))+float((float(ridx0)*float((6400)))))+float(((-81))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(float(float(float(float(float(ridx2)+float((float((int(idx0)%int((40))))*float((2)))))+float((float(ridx1)*float((80)))))+float((float((int((idx0/(40)))%int((40))))*float((160)))))+float((float(ridx0)*float((6400)))))+float(((-81))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):(0.0);
        float val1 = float(texture(data2, vec2(float(float(int(float(float(float((float(ridx0)*float((9))))+float((float(ridx1)*float((3)))))+float(ridx2))+float((float((idx0/(1600)))*float((576)))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(float(float((float(ridx0)*float((9))))+float((float(ridx1)*float((3)))))+float(ridx2))+float((float((idx0/(1600)))*float((576)))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
        acc0 = ((val0*val1)+acc0);
      }
    }
  }
  float val2 = float(texture(data3, vec2(float(float(int(idx0/(1600))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(idx0/(1600))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val3 = float(texture(data4, vec2(float(float(int(idx0/(1600))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(idx0/(1600))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val4 = float(texture(data5, vec2(float(float(int(idx0/(1600))%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(idx0/(1600))/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val5 = float(texture(data6, vec2(float(float(int(idx0/(1600))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(idx0/(1600))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  float alu0 = float((float((float(float((acc0-val2))*float(val3))*float(sqrt(((1.0)/(float(val4)+float((0.001))))))))+float(val5)));
  out_data = float((float(alu0)*float(((1.0)/(float((1.0))+float(exp2((float(alu0)*float(((-1.4426950408889634)))))))))));
}`;

const E_192_1600n1 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 307200 */
  float val0 = bool(float(float((idx0/(1600)))<float((64))))?(texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):(0.0);
  float val1 = bool(float(float((float((idx0/(1600)))*float(((-1)))))<float(((-63)))))?(texture(data2, vec2(float(float(int(float(idx0)+float(((-102400))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(idx0)+float(((-102400))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):(0.0);
  out_data = float((float(val0)+float(val1)));
}`;

const r_128_1600_192n1 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 204800 */
  float acc0 = (0.0);
  for (int ridx0 = (0); ridx0 < (192); ++ridx0) {
    float val0 = texture(data1, vec2(float(float(int(float((float(ridx0)*float((1600))))+float((int(idx0)%int((1600)))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(float((float(ridx0)*float((1600))))+float((int(idx0)%int((1600)))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r;
    float val1 = float(texture(data2, vec2(float(float(int(float(ridx0)+float((float((idx0/(1600)))*float((192)))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(ridx0)+float((float((idx0/(1600)))*float((192)))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val0*val1)+acc0);
  }
  out_data = float(acc0);
}`;

const r_64_40_40_128_3_3 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 102400 */
  float acc0 = (0.0);
  for (int ridx0 = (0); ridx0 < (128); ++ridx0) {
    for (int ridx1 = (0); ridx1 < (3); ++ridx1) {
      for (int ridx2 = (0); ridx2 < (3); ++ridx2) {
        float val0 = bool((float(float(float(float(float((float((float(ridx2)*float(((-1)))))+float((float((int(idx0)%int((40))))*float(((-1)))))))<float((0))))*float(float(float((float(ridx2)+float((int(idx0)%int((40))))))<float((41)))))*float(float(float((float((float(ridx1)*float(((-1)))))+float((float((int((idx0/(40)))%int((40))))*float(((-1)))))))<float((0)))))*float(float(float((float(ridx1)+float((int((idx0/(40)))%int((40))))))<float((41))))))?(texture(data1, vec2(float(float(int(float(float(float(float(float(ridx2)+float((int(idx0)%int((40)))))+float((float(ridx1)*float((40)))))+float((float((int((idx0/(40)))%int((40))))*float((40)))))+float((float(ridx0)*float((1600)))))+float(((-41))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(float(float(float(float(float(ridx2)+float((int(idx0)%int((40)))))+float((float(ridx1)*float((40)))))+float((float((int((idx0/(40)))%int((40))))*float((40)))))+float((float(ridx0)*float((1600)))))+float(((-41))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):(0.0);
        float val1 = float(texture(data2, vec2(float(float(int(float(float(float((float(ridx0)*float((9))))+float((float(ridx1)*float((3)))))+float(ridx2))+float((float((idx0/(1600)))*float((1152)))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(float(float((float(ridx0)*float((9))))+float((float(ridx1)*float((3)))))+float(ridx2))+float((float((idx0/(1600)))*float((1152)))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
        acc0 = ((val0*val1)+acc0);
      }
    }
  }
  float val2 = float(texture(data3, vec2(float(float(int(idx0/(1600))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(idx0/(1600))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val3 = float(texture(data4, vec2(float(float(int(idx0/(1600))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(idx0/(1600))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val4 = float(texture(data5, vec2(float(float(int(idx0/(1600))%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(idx0/(1600))/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val5 = float(texture(data6, vec2(float(float(int(idx0/(1600))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(idx0/(1600))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  float alu0 = float((float((float(float((acc0-val2))*float(val3))*float(sqrt(((1.0)/(float(val4)+float((0.001))))))))+float(val5)));
  out_data = float((float(alu0)*float(((1.0)/(float((1.0))+float(exp2((float(alu0)*float(((-1.4426950408889634)))))))))));
}`;

const r_64_1600_64 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 102400 */
  float acc0 = (0.0);
  for (int ridx0 = (0); ridx0 < (64); ++ridx0) {
    float val0 = texture(data1, vec2(float(float(int(float((float(ridx0)*float((1600))))+float((int(idx0)%int((1600)))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(float((float(ridx0)*float((1600))))+float((int(idx0)%int((1600)))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r;
    float val1 = float(texture(data2, vec2(float(float(int(float(ridx0)+float((float((idx0/(1600)))*float((64)))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(ridx0)+float((float((idx0/(1600)))*float((64)))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val0*val1)+acc0);
  }
  out_data = float(acc0);
}`;

const r_80_40_40_128_3_3 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 128000 */
  float acc0 = (0.0);
  for (int ridx0 = (0); ridx0 < (128); ++ridx0) {
    for (int ridx1 = (0); ridx1 < (3); ++ridx1) {
      for (int ridx2 = (0); ridx2 < (3); ++ridx2) {
        float val0 = bool((float(float(float(float(float((float((float(ridx2)*float(((-1)))))+float((float((int(idx0)%int((40))))*float(((-1)))))))<float((0))))*float(float(float((float(ridx2)+float((int(idx0)%int((40))))))<float((41)))))*float(float(float((float((float(ridx1)*float(((-1)))))+float((float((int((idx0/(40)))%int((40))))*float(((-1)))))))<float((0)))))*float(float(float((float(ridx1)+float((int((idx0/(40)))%int((40))))))<float((41))))))?(texture(data1, vec2(float(float(int(float(float(float(float(float(ridx2)+float((int(idx0)%int((40)))))+float((float(ridx1)*float((40)))))+float((float((int((idx0/(40)))%int((40))))*float((40)))))+float((float(ridx0)*float((1600)))))+float(((-41))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(float(float(float(float(float(ridx2)+float((int(idx0)%int((40)))))+float((float(ridx1)*float((40)))))+float((float((int((idx0/(40)))%int((40))))*float((40)))))+float((float(ridx0)*float((1600)))))+float(((-41))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):(0.0);
        float val1 = float(texture(data2, vec2(float(float(int(float(float(float((float(ridx0)*float((9))))+float((float(ridx1)*float((3)))))+float(ridx2))+float((float((idx0/(1600)))*float((1152)))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(float(float((float(ridx0)*float((9))))+float((float(ridx1)*float((3)))))+float(ridx2))+float((float((idx0/(1600)))*float((1152)))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
        acc0 = ((val0*val1)+acc0);
      }
    }
  }
  float val2 = float(texture(data3, vec2(float(float(int(idx0/(1600))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(idx0/(1600))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val3 = float(texture(data4, vec2(float(float(int(idx0/(1600))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(idx0/(1600))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val4 = float(texture(data5, vec2(float(float(int(idx0/(1600))%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(idx0/(1600))/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val5 = float(texture(data6, vec2(float(float(int(idx0/(1600))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(idx0/(1600))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  float alu0 = float((float((float(float((acc0-val2))*float(val3))*float(sqrt(((1.0)/(float(val4)+float((0.001))))))))+float(val5)));
  out_data = float((float(alu0)*float(((1.0)/(float((1.0))+float(exp2((float(alu0)*float(((-1.4426950408889634)))))))))));
}`;

const r_80_40_40_80_3_3 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 128000 */
  float acc0 = (0.0);
  for (int ridx0 = (0); ridx0 < (80); ++ridx0) {
    for (int ridx1 = (0); ridx1 < (3); ++ridx1) {
      for (int ridx2 = (0); ridx2 < (3); ++ridx2) {
        float val0 = bool((float(float(float(float(float((float((float(ridx2)*float(((-1)))))+float((float((int(idx0)%int((40))))*float(((-1)))))))<float((0))))*float(float(float((float(ridx2)+float((int(idx0)%int((40))))))<float((41)))))*float(float(float((float((float(ridx1)*float(((-1)))))+float((float((int((idx0/(40)))%int((40))))*float(((-1)))))))<float((0)))))*float(float(float((float(ridx1)+float((int((idx0/(40)))%int((40))))))<float((41))))))?(texture(data1, vec2(float(float(int(float(float(float(float(float(ridx2)+float((int(idx0)%int((40)))))+float((float(ridx1)*float((40)))))+float((float((int((idx0/(40)))%int((40))))*float((40)))))+float((float(ridx0)*float((1600)))))+float(((-41))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(float(float(float(float(float(ridx2)+float((int(idx0)%int((40)))))+float((float(ridx1)*float((40)))))+float((float((int((idx0/(40)))%int((40))))*float((40)))))+float((float(ridx0)*float((1600)))))+float(((-41))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):(0.0);
        float val1 = float(texture(data2, vec2(float(float(int(float(float(float((float(ridx0)*float((9))))+float((float(ridx1)*float((3)))))+float(ridx2))+float((float((idx0/(1600)))*float((720)))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(float(float((float(ridx0)*float((9))))+float((float(ridx1)*float((3)))))+float(ridx2))+float((float((idx0/(1600)))*float((720)))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
        acc0 = ((val0*val1)+acc0);
      }
    }
  }
  float val2 = float(texture(data3, vec2(float(float(int(idx0/(1600))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(idx0/(1600))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val3 = float(texture(data4, vec2(float(float(int(idx0/(1600))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(idx0/(1600))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val4 = float(texture(data5, vec2(float(float(int(idx0/(1600))%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(idx0/(1600))/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val5 = float(texture(data6, vec2(float(float(int(idx0/(1600))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(idx0/(1600))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  float alu0 = float((float((float(float((acc0-val2))*float(val3))*float(sqrt(((1.0)/(float(val4)+float((0.001))))))))+float(val5)));
  out_data = float((float(alu0)*float(((1.0)/(float((1.0))+float(exp2((float(alu0)*float(((-1.4426950408889634)))))))))));
}`;

const r_80_1600_80 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 128000 */
  float acc0 = (0.0);
  for (int ridx0 = (0); ridx0 < (80); ++ridx0) {
    float val0 = texture(data1, vec2(float(float(int(float((float(ridx0)*float((1600))))+float((int(idx0)%int((1600)))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(float((float(ridx0)*float((1600))))+float((int(idx0)%int((1600)))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r;
    float val1 = float(texture(data2, vec2(float(float(int(float(ridx0)+float((float((idx0/(1600)))*float((80)))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(ridx0)+float((float((idx0/(1600)))*float((80)))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val0*val1)+acc0);
  }
  out_data = float(acc0);
}`;

const r_128_20_20_128_3_3n2 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 51200 */
  float acc0 = (0.0);
  for (int ridx0 = (0); ridx0 < (128); ++ridx0) {
    for (int ridx1 = (0); ridx1 < (3); ++ridx1) {
      for (int ridx2 = (0); ridx2 < (3); ++ridx2) {
        float val0 = bool((float(float(float((float((float(ridx2)*float(((-1)))))+float((float((int(idx0)%int((20))))*float(((-2)))))))<float((0))))*float(float(float((float((float(ridx1)*float(((-1)))))+float((float((int((idx0/(20)))%int((20))))*float(((-2)))))))<float((0))))))?(texture(data1, vec2(float(float(int(float(float(float(float(float(ridx2)+float((float((int(idx0)%int((20))))*float((2)))))+float((float(ridx1)*float((40)))))+float((float((int((idx0/(20)))%int((20))))*float((80)))))+float((float(ridx0)*float((1600)))))+float(((-41))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(float(float(float(float(float(ridx2)+float((float((int(idx0)%int((20))))*float((2)))))+float((float(ridx1)*float((40)))))+float((float((int((idx0/(20)))%int((20))))*float((80)))))+float((float(ridx0)*float((1600)))))+float(((-41))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):(0.0);
        float val1 = float(texture(data2, vec2(float(float(int(float(float(float((float(ridx0)*float((9))))+float((float(ridx1)*float((3)))))+float(ridx2))+float((float((idx0/(400)))*float((1152)))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(float(float((float(ridx0)*float((9))))+float((float(ridx1)*float((3)))))+float(ridx2))+float((float((idx0/(400)))*float((1152)))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
        acc0 = ((val0*val1)+acc0);
      }
    }
  }
  float val2 = float(texture(data3, vec2(float(float(int(idx0/(400))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(idx0/(400))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val3 = float(texture(data4, vec2(float(float(int(idx0/(400))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(idx0/(400))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val4 = float(texture(data5, vec2(float(float(int(idx0/(400))%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(idx0/(400))/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val5 = float(texture(data6, vec2(float(float(int(idx0/(400))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(idx0/(400))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  float alu0 = float((float((float(float((acc0-val2))*float(val3))*float(sqrt(((1.0)/(float(val4)+float((0.001))))))))+float(val5)));
  out_data = float((float(alu0)*float(((1.0)/(float((1.0))+float(exp2((float(alu0)*float(((-1.4426950408889634)))))))))));
}`;

const E_384_400n1 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 153600 */
  float val0 = bool(float(float((idx0/(400)))<float((128))))?(texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):(0.0);
  float val1 = bool(float(float((float((idx0/(400)))*float(((-1)))))<float(((-127)))))?(texture(data2, vec2(float(float(int(float(idx0)+float(((-51200))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(idx0)+float(((-51200))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):(0.0);
  out_data = float((float(val0)+float(val1)));
}`;

const r_256_400_384n1 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 102400 */
  float acc0 = (0.0);
  for (int ridx0 = (0); ridx0 < (384); ++ridx0) {
    float val0 = texture(data1, vec2(float(float(int(float((float(ridx0)*float((400))))+float((int(idx0)%int((400)))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(float((float(ridx0)*float((400))))+float((int(idx0)%int((400)))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r;
    float val1 = float(texture(data2, vec2(float(float(int(float(ridx0)+float((float((idx0/(400)))*float((384)))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(ridx0)+float((float((idx0/(400)))*float((384)))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val0*val1)+acc0);
  }
  out_data = float(acc0);
}`;

const r_64_20_20_256_3_3 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 25600 */
  float acc0 = (0.0);
  for (int ridx0 = (0); ridx0 < (256); ++ridx0) {
    for (int ridx1 = (0); ridx1 < (3); ++ridx1) {
      for (int ridx2 = (0); ridx2 < (3); ++ridx2) {
        float val0 = bool((float(float(float(float(float((float((float(ridx2)*float(((-1)))))+float((float((int(idx0)%int((20))))*float(((-1)))))))<float((0))))*float(float(float((float(ridx2)+float((int(idx0)%int((20))))))<float((21)))))*float(float(float((float((float(ridx1)*float(((-1)))))+float((float((int((idx0/(20)))%int((20))))*float(((-1)))))))<float((0)))))*float(float(float((float(ridx1)+float((int((idx0/(20)))%int((20))))))<float((21))))))?(texture(data1, vec2(float(float(int(float(float(float(float(float(ridx2)+float((int(idx0)%int((20)))))+float((float(ridx1)*float((20)))))+float((float((int((idx0/(20)))%int((20))))*float((20)))))+float((float(ridx0)*float((400)))))+float(((-21))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(float(float(float(float(float(ridx2)+float((int(idx0)%int((20)))))+float((float(ridx1)*float((20)))))+float((float((int((idx0/(20)))%int((20))))*float((20)))))+float((float(ridx0)*float((400)))))+float(((-21))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):(0.0);
        float val1 = float(texture(data2, vec2(float(float(int(float(float(float((float(ridx0)*float((9))))+float((float(ridx1)*float((3)))))+float(ridx2))+float((float((idx0/(400)))*float((2304)))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(float(float((float(ridx0)*float((9))))+float((float(ridx1)*float((3)))))+float(ridx2))+float((float((idx0/(400)))*float((2304)))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
        acc0 = ((val0*val1)+acc0);
      }
    }
  }
  float val2 = float(texture(data3, vec2(float(float(int(idx0/(400))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(idx0/(400))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val3 = float(texture(data4, vec2(float(float(int(idx0/(400))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(idx0/(400))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val4 = float(texture(data5, vec2(float(float(int(idx0/(400))%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(idx0/(400))/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val5 = float(texture(data6, vec2(float(float(int(idx0/(400))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(idx0/(400))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  float alu0 = float((float((float(float((acc0-val2))*float(val3))*float(sqrt(((1.0)/(float(val4)+float((0.001))))))))+float(val5)));
  out_data = float((float(alu0)*float(((1.0)/(float((1.0))+float(exp2((float(alu0)*float(((-1.4426950408889634)))))))))));
}`;

const r_64_20_20_64_3_3 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 25600 */
  float acc0 = (0.0);
  for (int ridx0 = (0); ridx0 < (64); ++ridx0) {
    for (int ridx1 = (0); ridx1 < (3); ++ridx1) {
      for (int ridx2 = (0); ridx2 < (3); ++ridx2) {
        float val0 = bool((float(float(float(float(float((float((float(ridx2)*float(((-1)))))+float((float((int(idx0)%int((20))))*float(((-1)))))))<float((0))))*float(float(float((float(ridx2)+float((int(idx0)%int((20))))))<float((21)))))*float(float(float((float((float(ridx1)*float(((-1)))))+float((float((int((idx0/(20)))%int((20))))*float(((-1)))))))<float((0)))))*float(float(float((float(ridx1)+float((int((idx0/(20)))%int((20))))))<float((21))))))?(texture(data1, vec2(float(float(int(float(float(float(float(float(ridx2)+float((int(idx0)%int((20)))))+float((float(ridx1)*float((20)))))+float((float((int((idx0/(20)))%int((20))))*float((20)))))+float((float(ridx0)*float((400)))))+float(((-21))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(float(float(float(float(float(ridx2)+float((int(idx0)%int((20)))))+float((float(ridx1)*float((20)))))+float((float((int((idx0/(20)))%int((20))))*float((20)))))+float((float(ridx0)*float((400)))))+float(((-21))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):(0.0);
        float val1 = float(texture(data2, vec2(float(float(int(float(float(float((float(ridx0)*float((9))))+float((float(ridx1)*float((3)))))+float(ridx2))+float((float((idx0/(400)))*float((576)))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(float(float((float(ridx0)*float((9))))+float((float(ridx1)*float((3)))))+float(ridx2))+float((float((idx0/(400)))*float((576)))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
        acc0 = ((val0*val1)+acc0);
      }
    }
  }
  float val2 = float(texture(data3, vec2(float(float(int(idx0/(400))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(idx0/(400))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val3 = float(texture(data4, vec2(float(float(int(idx0/(400))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(idx0/(400))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val4 = float(texture(data5, vec2(float(float(int(idx0/(400))%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(idx0/(400))/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val5 = float(texture(data6, vec2(float(float(int(idx0/(400))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(idx0/(400))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  float alu0 = float((float((float(float((acc0-val2))*float(val3))*float(sqrt(((1.0)/(float(val4)+float((0.001))))))))+float(val5)));
  out_data = float((float(alu0)*float(((1.0)/(float((1.0))+float(exp2((float(alu0)*float(((-1.4426950408889634)))))))))));
}`;

const r_64_400_64 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 25600 */
  float acc0 = (0.0);
  for (int ridx0 = (0); ridx0 < (64); ++ridx0) {
    float val0 = texture(data1, vec2(float(float(int(float((float(ridx0)*float((400))))+float((int(idx0)%int((400)))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(float((float(ridx0)*float((400))))+float((int(idx0)%int((400)))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r;
    float val1 = float(texture(data2, vec2(float(float(int(float(ridx0)+float((float((idx0/(400)))*float((64)))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(ridx0)+float((float((idx0/(400)))*float((64)))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val0*val1)+acc0);
  }
  out_data = float(acc0);
}`;

const r_80_20_20_256_3_3 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 32000 */
  float acc0 = (0.0);
  for (int ridx0 = (0); ridx0 < (256); ++ridx0) {
    for (int ridx1 = (0); ridx1 < (3); ++ridx1) {
      for (int ridx2 = (0); ridx2 < (3); ++ridx2) {
        float val0 = bool((float(float(float(float(float((float((float(ridx2)*float(((-1)))))+float((float((int(idx0)%int((20))))*float(((-1)))))))<float((0))))*float(float(float((float(ridx2)+float((int(idx0)%int((20))))))<float((21)))))*float(float(float((float((float(ridx1)*float(((-1)))))+float((float((int((idx0/(20)))%int((20))))*float(((-1)))))))<float((0)))))*float(float(float((float(ridx1)+float((int((idx0/(20)))%int((20))))))<float((21))))))?(texture(data1, vec2(float(float(int(float(float(float(float(float(ridx2)+float((int(idx0)%int((20)))))+float((float(ridx1)*float((20)))))+float((float((int((idx0/(20)))%int((20))))*float((20)))))+float((float(ridx0)*float((400)))))+float(((-21))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(float(float(float(float(float(ridx2)+float((int(idx0)%int((20)))))+float((float(ridx1)*float((20)))))+float((float((int((idx0/(20)))%int((20))))*float((20)))))+float((float(ridx0)*float((400)))))+float(((-21))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):(0.0);
        float val1 = float(texture(data2, vec2(float(float(int(float(float(float((float(ridx0)*float((9))))+float((float(ridx1)*float((3)))))+float(ridx2))+float((float((idx0/(400)))*float((2304)))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(float(float((float(ridx0)*float((9))))+float((float(ridx1)*float((3)))))+float(ridx2))+float((float((idx0/(400)))*float((2304)))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
        acc0 = ((val0*val1)+acc0);
      }
    }
  }
  float val2 = float(texture(data3, vec2(float(float(int(idx0/(400))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(idx0/(400))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val3 = float(texture(data4, vec2(float(float(int(idx0/(400))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(idx0/(400))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val4 = float(texture(data5, vec2(float(float(int(idx0/(400))%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(idx0/(400))/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val5 = float(texture(data6, vec2(float(float(int(idx0/(400))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(idx0/(400))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  float alu0 = float((float((float(float((acc0-val2))*float(val3))*float(sqrt(((1.0)/(float(val4)+float((0.001))))))))+float(val5)));
  out_data = float((float(alu0)*float(((1.0)/(float((1.0))+float(exp2((float(alu0)*float(((-1.4426950408889634)))))))))));
}`;

const r_80_20_20_80_3_3 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 32000 */
  float acc0 = (0.0);
  for (int ridx0 = (0); ridx0 < (80); ++ridx0) {
    for (int ridx1 = (0); ridx1 < (3); ++ridx1) {
      for (int ridx2 = (0); ridx2 < (3); ++ridx2) {
        float val0 = bool((float(float(float(float(float((float((float(ridx2)*float(((-1)))))+float((float((int(idx0)%int((20))))*float(((-1)))))))<float((0))))*float(float(float((float(ridx2)+float((int(idx0)%int((20))))))<float((21)))))*float(float(float((float((float(ridx1)*float(((-1)))))+float((float((int((idx0/(20)))%int((20))))*float(((-1)))))))<float((0)))))*float(float(float((float(ridx1)+float((int((idx0/(20)))%int((20))))))<float((21))))))?(texture(data1, vec2(float(float(int(float(float(float(float(float(ridx2)+float((int(idx0)%int((20)))))+float((float(ridx1)*float((20)))))+float((float((int((idx0/(20)))%int((20))))*float((20)))))+float((float(ridx0)*float((400)))))+float(((-21))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(float(float(float(float(float(ridx2)+float((int(idx0)%int((20)))))+float((float(ridx1)*float((20)))))+float((float((int((idx0/(20)))%int((20))))*float((20)))))+float((float(ridx0)*float((400)))))+float(((-21))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):(0.0);
        float val1 = float(texture(data2, vec2(float(float(int(float(float(float((float(ridx0)*float((9))))+float((float(ridx1)*float((3)))))+float(ridx2))+float((float((idx0/(400)))*float((720)))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(float(float((float(ridx0)*float((9))))+float((float(ridx1)*float((3)))))+float(ridx2))+float((float((idx0/(400)))*float((720)))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
        acc0 = ((val0*val1)+acc0);
      }
    }
  }
  float val2 = float(texture(data3, vec2(float(float(int(idx0/(400))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(idx0/(400))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val3 = float(texture(data4, vec2(float(float(int(idx0/(400))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(idx0/(400))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val4 = float(texture(data5, vec2(float(float(int(idx0/(400))%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(idx0/(400))/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val5 = float(texture(data6, vec2(float(float(int(idx0/(400))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(idx0/(400))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  float alu0 = float((float((float(float((acc0-val2))*float(val3))*float(sqrt(((1.0)/(float(val4)+float((0.001))))))))+float(val5)));
  out_data = float((float(alu0)*float(((1.0)/(float((1.0))+float(exp2((float(alu0)*float(((-1.4426950408889634)))))))))));
}`;

const r_80_400_80 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 32000 */
  float acc0 = (0.0);
  for (int ridx0 = (0); ridx0 < (80); ++ridx0) {
    float val0 = texture(data1, vec2(float(float(int(float((float(ridx0)*float((400))))+float((int(idx0)%int((400)))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(float((float(ridx0)*float((400))))+float((int(idx0)%int((400)))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r;
    float val1 = float(texture(data2, vec2(float(float(int(float(ridx0)+float((float((idx0/(400)))*float((80)))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(ridx0)+float((float((idx0/(400)))*float((80)))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val0*val1)+acc0);
  }
  out_data = float(acc0);
}`;

const E_16_4_8400 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
uniform sampler2D data7;
uniform sampler2D data8;
uniform sampler2D data9;
uniform sampler2D data10;
uniform sampler2D data11;
uniform sampler2D data12;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 537600 */
  bool alu0 = bool(float(float((int(idx0)%int((8400))))<float((6400))));
  bool alu1 = bool((float(alu0)*float(float(float((float(float((float((int((idx0/(8400)))%int((4))))*float((16))))+float((idx0/(33600))))+float(((int(idx0)%int((8400)))/(6400)))))<float((64))))));
  float val0 = bool(alu1)?(texture(data1, vec2(float(float(int(float(float((int(idx0)%int((8400))))+float((float((int((idx0/(8400)))%int((4))))*float((102400)))))+float((float((idx0/(33600)))*float((6400)))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(float(float((int(idx0)%int((8400))))+float((float((int((idx0/(8400)))%int((4))))*float((102400)))))+float((float((idx0/(33600)))*float((6400)))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):(0.0);
  float val1 = bool(alu1)?(float(texture(data2, vec2(float(float(int(float(float((float((int((idx0/(8400)))%int((4))))*float((16))))+float((idx0/(33600))))+float(((int(idx0)%int((8400)))/(6400))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(float(float((float((int((idx0/(8400)))%int((4))))*float((16))))+float((idx0/(33600))))+float(((int(idx0)%int((8400)))/(6400))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r)):(0.0);
  bool alu2 = bool((float(alu0)*float(float(float((float(float((float((int((idx0/(8400)))%int((4))))*float(((-16)))))+float((float((idx0/(33600)))*float(((-1))))))+float((float(((int(idx0)%int((8400)))/(6400)))*float(((-1)))))))<float(((-63)))))));
  float val2 = bool(alu2)?(texture(data3, vec2(float(float(int(float(float(float((int(idx0)%int((8400))))+float((float((int((idx0/(8400)))%int((4))))*float((102400)))))+float((float((idx0/(33600)))*float((6400)))))+float(((-409600))))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(float(float(float((int(idx0)%int((8400))))+float((float((int((idx0/(8400)))%int((4))))*float((102400)))))+float((float((idx0/(33600)))*float((6400)))))+float(((-409600))))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):(0.0);
  float val3 = bool(alu2)?(float(texture(data4, vec2(float(float(int(float(float(float((float((int((idx0/(8400)))%int((4))))*float((16))))+float((idx0/(33600))))+float(((int(idx0)%int((8400)))/(6400))))+float(((-64))))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(float(float(float((float((int((idx0/(8400)))%int((4))))*float((16))))+float((idx0/(33600))))+float(((int(idx0)%int((8400)))/(6400))))+float(((-64))))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r)):(0.0);
  bool alu3 = bool((float(float(float((float((int(idx0)%int((8400))))*float(((-1)))))<float(((-6399)))))*float(float(float((int(idx0)%int((8400))))<float((8000))))));
  bool alu4 = bool((float(alu3)*float(float(float((int((float(float(float((float((int((idx0/(8400)))%int((4))))*float((16))))+float((idx0/(33600))))+float(((int(idx0)%int((8400)))/(1600))))+float((140))))%int((144))))<float((64))))));
  float val4 = bool(alu4)?(texture(data5, vec2(float(float(int(int((float(float(float((int(idx0)%int((8400))))+float((float((int((idx0/(8400)))%int((4))))*float((25600)))))+float((float((idx0/(33600)))*float((1600)))))+float((224000))))%int((230400)))%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(int((float(float(float((int(idx0)%int((8400))))+float((float((int((idx0/(8400)))%int((4))))*float((25600)))))+float((float((idx0/(33600)))*float((1600)))))+float((224000))))%int((230400)))/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r):(0.0);
  float val5 = bool(alu4)?(float(texture(data6, vec2(float(float(int(int((float(float(float((float((int((idx0/(8400)))%int((4))))*float((16))))+float((idx0/(33600))))+float(((int(idx0)%int((8400)))/(1600))))+float((140))))%int((144)))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(int((float(float(float((float((int((idx0/(8400)))%int((4))))*float((16))))+float((idx0/(33600))))+float(((int(idx0)%int((8400)))/(1600))))+float((140))))%int((144)))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r)):(0.0);
  bool alu5 = bool((float(alu3)*float(float(float((float((int((float(float(float((float((int((idx0/(8400)))%int((4))))*float((16))))+float((idx0/(33600))))+float(((int(idx0)%int((8400)))/(1600))))+float((140))))%int((144))))*float(((-1)))))<float(((-63)))))));
  float val6 = bool(alu5)?(texture(data7, vec2(float(float(int(float((int((float(float(float((int(idx0)%int((8400))))+float((float((int((idx0/(8400)))%int((4))))*float((25600)))))+float((float((idx0/(33600)))*float((1600)))))+float((224000))))%int((230400))))+float(((-102400))))%textureSize(data7, 0).x) + 0.5f)/float(textureSize(data7, 0).x), float(float(int(float((int((float(float(float((int(idx0)%int((8400))))+float((float((int((idx0/(8400)))%int((4))))*float((25600)))))+float((float((idx0/(33600)))*float((1600)))))+float((224000))))%int((230400))))+float(((-102400))))/textureSize(data7, 0).x) + 0.5f)/float(textureSize(data7, 0).y))).r):(0.0);
  float val7 = bool(alu5)?(float(texture(data8, vec2(float(float(int(float((int((float(float(float((float((int((idx0/(8400)))%int((4))))*float((16))))+float((idx0/(33600))))+float(((int(idx0)%int((8400)))/(1600))))+float((140))))%int((144))))+float(((-64))))%textureSize(data8, 0).x) + 0.5f)/float(textureSize(data8, 0).x), float(float(int(float((int((float(float(float((float((int((idx0/(8400)))%int((4))))*float((16))))+float((idx0/(33600))))+float(((int(idx0)%int((8400)))/(1600))))+float((140))))%int((144))))+float(((-64))))/textureSize(data8, 0).x) + 0.5f)/float(textureSize(data8, 0).y))).r)):(0.0);
  bool alu6 = bool(float(float((float((int(idx0)%int((8400))))*float(((-1)))))<float(((-7999)))));
  bool alu7 = bool((float(alu6)*float(float(float((int((float(float(float((float((int((idx0/(8400)))%int((4))))*float((16))))+float((idx0/(33600))))+float((int((idx0/(400)))%int((21)))))+float((124))))%int((144))))<float((64))))));
  float val8 = bool(alu7)?(texture(data9, vec2(float(float(int(int((float(float(float((int(idx0)%int((8400))))+float((float((int((idx0/(8400)))%int((4))))*float((6400)))))+float((float((idx0/(33600)))*float((400)))))+float((49600))))%int((57600)))%textureSize(data9, 0).x) + 0.5f)/float(textureSize(data9, 0).x), float(float(int(int((float(float(float((int(idx0)%int((8400))))+float((float((int((idx0/(8400)))%int((4))))*float((6400)))))+float((float((idx0/(33600)))*float((400)))))+float((49600))))%int((57600)))/textureSize(data9, 0).x) + 0.5f)/float(textureSize(data9, 0).y))).r):(0.0);
  float val9 = bool(alu7)?(float(texture(data10, vec2(float(float(int(int((float(float(float((float((int((idx0/(8400)))%int((4))))*float((16))))+float((idx0/(33600))))+float((int((idx0/(400)))%int((21)))))+float((124))))%int((144)))%textureSize(data10, 0).x) + 0.5f)/float(textureSize(data10, 0).x), float(float(int(int((float(float(float((float((int((idx0/(8400)))%int((4))))*float((16))))+float((idx0/(33600))))+float((int((idx0/(400)))%int((21)))))+float((124))))%int((144)))/textureSize(data10, 0).x) + 0.5f)/float(textureSize(data10, 0).y))).r)):(0.0);
  bool alu8 = bool((float(alu6)*float(float(float((float((int((float(float(float((float((int((idx0/(8400)))%int((4))))*float((16))))+float((idx0/(33600))))+float((int((idx0/(400)))%int((21)))))+float((124))))%int((144))))*float(((-1)))))<float(((-63)))))));
  float val10 = bool(alu8)?(texture(data11, vec2(float(float(int(float((int((float(float(float((int(idx0)%int((8400))))+float((float((int((idx0/(8400)))%int((4))))*float((6400)))))+float((float((idx0/(33600)))*float((400)))))+float((49600))))%int((57600))))+float(((-25600))))%textureSize(data11, 0).x) + 0.5f)/float(textureSize(data11, 0).x), float(float(int(float((int((float(float(float((int(idx0)%int((8400))))+float((float((int((idx0/(8400)))%int((4))))*float((6400)))))+float((float((idx0/(33600)))*float((400)))))+float((49600))))%int((57600))))+float(((-25600))))/textureSize(data11, 0).x) + 0.5f)/float(textureSize(data11, 0).y))).r):(0.0);
  float val11 = bool(alu8)?(float(texture(data12, vec2(float(float(int(float((int((float(float(float((float((int((idx0/(8400)))%int((4))))*float((16))))+float((idx0/(33600))))+float((int((idx0/(400)))%int((21)))))+float((124))))%int((144))))+float(((-64))))%textureSize(data12, 0).x) + 0.5f)/float(textureSize(data12, 0).x), float(float(int(float((int((float(float(float((float((int((idx0/(8400)))%int((4))))*float((16))))+float((idx0/(33600))))+float((int((idx0/(400)))%int((21)))))+float((124))))%int((144))))+float(((-64))))/textureSize(data12, 0).x) + 0.5f)/float(textureSize(data12, 0).y))).r)):(0.0);
  out_data = float((float(float(float(float(val0)+float(val1))+float((float(val2)+float(val3))))+float((float(float(val4)+float(val5))+float((float(val6)+float(val7))))))+float((float(float(val8)+float(val9))+float((float(val10)+float(val11)))))));
}`;

const r_33600_16 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 33600 */
  float acc0 = -(1./0.);
  for (int ridx0 = (0); ridx0 < (16); ++ridx0) {
    float val0 = texture(data1, vec2(float(float(int(float(idx0)+float((float(ridx0)*float((33600)))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(float(idx0)+float((float(ridx0)*float((33600)))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r;
    float alu0 = float(max(val0,acc0));
    acc0 = alu0;
  }
  out_data = float(acc0);
}`;

const E_16_33600 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 537600 */
  float val0 = texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r;
  float val1 = texture(data2, vec2(float(float(int(int(idx0)%int((33600)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(int(idx0)%int((33600)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r;
  out_data = float(exp2((float((val0-val1))*float((1.4426950408889634)))));
}`;

const r_33600_16n1 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 33600 */
  float acc0 = (0.0);
  for (int ridx0 = (0); ridx0 < (16); ++ridx0) {
    float val0 = texture(data1, vec2(float(float(int(float(idx0)+float((float(ridx0)*float((33600)))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(float(idx0)+float((float(ridx0)*float((33600)))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r;
    acc0 = (float(val0)+float(acc0));
  }
  out_data = float(acc0);
}`;

const r_33600_16n2 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 33600 */
  float acc0 = (0.0);
  for (int ridx0 = (0); ridx0 < (16); ++ridx0) {
    float val0 = texture(data1, vec2(float(float(int(float(idx0)+float((float(ridx0)*float((33600)))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(float(idx0)+float((float(ridx0)*float((33600)))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r;
    float val1 = texture(data2, vec2(float(float(int(idx0)%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(idx0)/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r;
    float val2 = float(texture(data3, vec2(float(float(int(ridx0)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(ridx0)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
    acc0 = (((val0/val1)*val2)+acc0);
  }
  out_data = float(acc0);
}`;

const E_8400 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;

out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 8400 */
  out_data = float((float(float((float(float(float(idx0)<float((6400))))!=0.0?(8.0):(0.0)))+float((float((float(float(float((float(idx0)*float(((-1)))))<float(((-6399)))))*float(float(float(idx0)<float((8000))))))!=0.0?(16.0):(0.0))))+float((float(float(float((float(idx0)*float(((-1)))))<float(((-7999)))))!=0.0?(32.0):(0.0)))));
}`;

const E_80_8400 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
uniform sampler2D data7;
uniform sampler2D data8;
uniform sampler2D data9;
uniform sampler2D data10;
uniform sampler2D data11;
uniform sampler2D data12;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 672000 */
  bool alu0 = bool(float(float((int(idx0)%int((8400))))<float((6400))));
  bool alu1 = bool((float(alu0)*float(float(float((int((float(float((idx0/(8400)))+float(((int(idx0)%int((8400)))/(6400))))+float((64))))%int((144))))<float((64))))));
  float val0 = bool(alu1)?(texture(data1, vec2(float(float(int(int((float(float((int(idx0)%int((8400))))+float((float((idx0/(8400)))*float((6400)))))+float((409600))))%int((921600)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(int((float(float((int(idx0)%int((8400))))+float((float((idx0/(8400)))*float((6400)))))+float((409600))))%int((921600)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):(0.0);
  float val1 = bool(alu1)?(float(texture(data2, vec2(float(float(int(int((float(float((idx0/(8400)))+float(((int(idx0)%int((8400)))/(6400))))+float((64))))%int((144)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(int((float(float((idx0/(8400)))+float(((int(idx0)%int((8400)))/(6400))))+float((64))))%int((144)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r)):(0.0);
  bool alu2 = bool((float(alu0)*float(float(float((float((int((float(float((idx0/(8400)))+float(((int(idx0)%int((8400)))/(6400))))+float((64))))%int((144))))*float(((-1)))))<float(((-63)))))));
  float val2 = bool(alu2)?(texture(data3, vec2(float(float(int(float((int((float(float((int(idx0)%int((8400))))+float((float((idx0/(8400)))*float((6400)))))+float((409600))))%int((921600))))+float(((-409600))))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(float((int((float(float((int(idx0)%int((8400))))+float((float((idx0/(8400)))*float((6400)))))+float((409600))))%int((921600))))+float(((-409600))))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):(0.0);
  float val3 = bool(alu2)?(float(texture(data4, vec2(float(float(int(float((int((float(float((idx0/(8400)))+float(((int(idx0)%int((8400)))/(6400))))+float((64))))%int((144))))+float(((-64))))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(float((int((float(float((idx0/(8400)))+float(((int(idx0)%int((8400)))/(6400))))+float((64))))%int((144))))+float(((-64))))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r)):(0.0);
  bool alu3 = bool((float(float(float((float((int(idx0)%int((8400))))*float(((-1)))))<float(((-6399)))))*float(float(float((int(idx0)%int((8400))))<float((8000))))));
  bool alu4 = bool((float(alu3)*float(float(float((int((float(float((idx0/(8400)))+float(((int(idx0)%int((8400)))/(1600))))+float((60))))%int((144))))<float((64))))));
  float val4 = bool(alu4)?(texture(data5, vec2(float(float(int(int((float(float((int(idx0)%int((8400))))+float((float((idx0/(8400)))*float((1600)))))+float((96000))))%int((230400)))%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(int((float(float((int(idx0)%int((8400))))+float((float((idx0/(8400)))*float((1600)))))+float((96000))))%int((230400)))/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r):(0.0);
  float val5 = bool(alu4)?(float(texture(data6, vec2(float(float(int(int((float(float((idx0/(8400)))+float(((int(idx0)%int((8400)))/(1600))))+float((60))))%int((144)))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(int((float(float((idx0/(8400)))+float(((int(idx0)%int((8400)))/(1600))))+float((60))))%int((144)))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r)):(0.0);
  bool alu5 = bool((float(alu3)*float(float(float((float((int((float(float((idx0/(8400)))+float(((int(idx0)%int((8400)))/(1600))))+float((60))))%int((144))))*float(((-1)))))<float(((-63)))))));
  float val6 = bool(alu5)?(texture(data7, vec2(float(float(int(float((int((float(float((int(idx0)%int((8400))))+float((float((idx0/(8400)))*float((1600)))))+float((96000))))%int((230400))))+float(((-102400))))%textureSize(data7, 0).x) + 0.5f)/float(textureSize(data7, 0).x), float(float(int(float((int((float(float((int(idx0)%int((8400))))+float((float((idx0/(8400)))*float((1600)))))+float((96000))))%int((230400))))+float(((-102400))))/textureSize(data7, 0).x) + 0.5f)/float(textureSize(data7, 0).y))).r):(0.0);
  float val7 = bool(alu5)?(float(texture(data8, vec2(float(float(int(float((int((float(float((idx0/(8400)))+float(((int(idx0)%int((8400)))/(1600))))+float((60))))%int((144))))+float(((-64))))%textureSize(data8, 0).x) + 0.5f)/float(textureSize(data8, 0).x), float(float(int(float((int((float(float((idx0/(8400)))+float(((int(idx0)%int((8400)))/(1600))))+float((60))))%int((144))))+float(((-64))))/textureSize(data8, 0).x) + 0.5f)/float(textureSize(data8, 0).y))).r)):(0.0);
  bool alu6 = bool(float(float((float((int(idx0)%int((8400))))*float(((-1)))))<float(((-7999)))));
  bool alu7 = bool((float(alu6)*float(float(float((float((idx0/(8400)))+float((int((idx0/(400)))%int((21))))))<float((20))))));
  float val8 = bool(alu7)?(texture(data9, vec2(float(float(int(float(float((int(idx0)%int((8400))))+float((float((idx0/(8400)))*float((400)))))+float((17600)))%textureSize(data9, 0).x) + 0.5f)/float(textureSize(data9, 0).x), float(float(int(float(float((int(idx0)%int((8400))))+float((float((idx0/(8400)))*float((400)))))+float((17600)))/textureSize(data9, 0).x) + 0.5f)/float(textureSize(data9, 0).y))).r):(0.0);
  float val9 = bool(alu7)?(float(texture(data10, vec2(float(float(int(float(float((idx0/(8400)))+float((int((idx0/(400)))%int((21)))))+float((44)))%textureSize(data10, 0).x) + 0.5f)/float(textureSize(data10, 0).x), float(float(int(float(float((idx0/(8400)))+float((int((idx0/(400)))%int((21)))))+float((44)))/textureSize(data10, 0).x) + 0.5f)/float(textureSize(data10, 0).y))).r)):(0.0);
  bool alu8 = bool((float(alu6)*float(float(float((float((float((idx0/(8400)))*float(((-1)))))+float((float((int((idx0/(400)))%int((21))))*float(((-1)))))))<float(((-19)))))));
  float val10 = bool(alu8)?(texture(data11, vec2(float(float(int(float(float((int(idx0)%int((8400))))+float((float((idx0/(8400)))*float((400)))))+float(((-8000))))%textureSize(data11, 0).x) + 0.5f)/float(textureSize(data11, 0).x), float(float(int(float(float((int(idx0)%int((8400))))+float((float((idx0/(8400)))*float((400)))))+float(((-8000))))/textureSize(data11, 0).x) + 0.5f)/float(textureSize(data11, 0).y))).r):(0.0);
  float val11 = bool(alu8)?(float(texture(data12, vec2(float(float(int(float(float((idx0/(8400)))+float((int((idx0/(400)))%int((21)))))+float(((-20))))%textureSize(data12, 0).x) + 0.5f)/float(textureSize(data12, 0).x), float(float(int(float(float((idx0/(8400)))+float((int((idx0/(400)))%int((21)))))+float(((-20))))/textureSize(data12, 0).x) + 0.5f)/float(textureSize(data12, 0).y))).r)):(0.0);
  out_data = float(((1.0)/(float((1.0))+float(exp2((float((float(float(float(float(val0)+float(val1))+float((float(val2)+float(val3))))+float((float(float(val4)+float(val5))+float((float(val6)+float(val7))))))+float((float(float(val8)+float(val9))+float((float(val10)+float(val11)))))))*float(((-1.4426950408889634)))))))));
}`;

const E_84_8400 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int w;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
uniform sampler2D data7;
uniform sampler2D data8;
uniform sampler2D data9;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5f) * w + int(gl_FragCoord.x-0.5f); /* 705600 */
  bool alu0 = bool(float(float((int(idx0)%int((8400))))<float((6400))));
  bool alu1 = bool(float(float((idx0/(8400)))<float((1))));
  float val0 = bool((float(alu0)*float(alu1)))?(texture(data1, vec2(float(float(int(int(idx0)%int((80)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(int(idx0)%int((80)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):(0.0);
  bool alu2 = bool(float(float((float((idx0/(8400)))*float(((-1)))))<float((0))));
  bool alu3 = bool(float(float((idx0/(8400)))<float((2))));
  float val1 = bool((float(float(alu0)*float(alu2))*float(alu3)))?(texture(data2, vec2(float(float(int(int((int((idx0/(80)))%int((105))))%int((80)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(int((int((idx0/(80)))%int((105))))%int((80)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):(0.0);
  bool alu4 = bool((float(float(float((float((int(idx0)%int((8400))))*float(((-1)))))<float(((-6399)))))*float(float(float((int(idx0)%int((8400))))<float((8000))))));
  float val2 = bool((float(alu4)*float(alu1)))?(texture(data3, vec2(float(float(int(int(idx0)%int((40)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(int(idx0)%int((40)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):(0.0);
  float val3 = bool((float(float(alu4)*float(alu2))*float(alu3)))?(texture(data4, vec2(float(float(int(int((int((idx0/(40)))%int((210))))%int((40)))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(int((int((idx0/(40)))%int((210))))%int((40)))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r):(0.0);
  bool alu5 = bool(float(float((float((int(idx0)%int((8400))))*float(((-1)))))<float(((-7999)))));
  float val4 = bool((float(alu5)*float(alu1)))?(texture(data5, vec2(float(float(int(int(idx0)%int((20)))%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(int(idx0)%int((20)))/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r):(0.0);
  float val5 = bool((float(float(alu5)*float(alu2))*float(alu3)))?(texture(data6, vec2(float(float(int(int((idx0/(20)))%int((20)))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(int((idx0/(20)))%int((20)))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r):(0.0);
  float val6 = bool(alu3)?(texture(data7, vec2(float(float(int(idx0)%textureSize(data7, 0).x) + 0.5f)/float(textureSize(data7, 0).x), float(float(int(idx0)/textureSize(data7, 0).x) + 0.5f)/float(textureSize(data7, 0).y))).r):(0.0);
  float val7 = bool(alu3)?(texture(data7, vec2(float(float(int(float(idx0)+float((16800)))%textureSize(data7, 0).x) + 0.5f)/float(textureSize(data7, 0).x), float(float(int(float(idx0)+float((16800)))/textureSize(data7, 0).x) + 0.5f)/float(textureSize(data7, 0).y))).r):(0.0);
  bool alu6 = bool(float(float((float((idx0/(8400)))*float(((-1)))))<float(((-1)))));
  bool alu7 = bool(float(float((idx0/(8400)))<float((3))));
  float val8 = bool((float(float(alu0)*float(alu6))*float(alu7)))?(texture(data1, vec2(float(float(int(int(idx0)%int((80)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(int(idx0)%int((80)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):(0.0);
  bool alu8 = bool(float(float((float((idx0/(8400)))*float(((-1)))))<float(((-2)))));
  bool alu9 = bool(float(float((idx0/(8400)))<float((4))));
  float val9 = bool((float(float(alu0)*float(alu8))*float(alu9)))?(texture(data2, vec2(float(float(int(int((int((idx0/(80)))%int((105))))%int((80)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(int((int((idx0/(80)))%int((105))))%int((80)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):(0.0);
  float val10 = bool((float(float(alu4)*float(alu6))*float(alu7)))?(texture(data3, vec2(float(float(int(int(idx0)%int((40)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(int(idx0)%int((40)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):(0.0);
  float val11 = bool((float(float(alu4)*float(alu8))*float(alu9)))?(texture(data4, vec2(float(float(int(int((int((idx0/(40)))%int((210))))%int((40)))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(int((int((idx0/(40)))%int((210))))%int((40)))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r):(0.0);
  float val12 = bool((float(float(alu5)*float(alu6))*float(alu7)))?(texture(data5, vec2(float(float(int(int(idx0)%int((20)))%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(int(idx0)%int((20)))/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r):(0.0);
  float val13 = bool((float(float(alu5)*float(alu8))*float(alu9)))?(texture(data6, vec2(float(float(int(int((idx0/(20)))%int((20)))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(int((idx0/(20)))%int((20)))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r):(0.0);
  bool alu10 = bool((float(alu6)*float(alu9)));
  float val14 = bool(alu10)?(texture(data7, vec2(float(float(int(idx0)%textureSize(data7, 0).x) + 0.5f)/float(textureSize(data7, 0).x), float(float(int(idx0)/textureSize(data7, 0).x) + 0.5f)/float(textureSize(data7, 0).y))).r):(0.0);
  float val15 = bool(alu10)?(texture(data7, vec2(float(float(int(float(idx0)+float(((-16800))))%textureSize(data7, 0).x) + 0.5f)/float(textureSize(data7, 0).x), float(float(int(float(idx0)+float(((-16800))))/textureSize(data7, 0).x) + 0.5f)/float(textureSize(data7, 0).y))).r):(0.0);
  float val16 = bool(alu9)?(texture(data8, vec2(float(float(int(int(idx0)%int((8400)))%textureSize(data8, 0).x) + 0.5f)/float(textureSize(data8, 0).x), float(float(int(int(idx0)%int((8400)))/textureSize(data8, 0).x) + 0.5f)/float(textureSize(data8, 0).y))).r):(0.0);
  float val17 = bool(float(float((float((idx0/(8400)))*float(((-1)))))<float(((-3)))))?(texture(data9, vec2(float(float(int(float(idx0)+float(((-33600))))%textureSize(data9, 0).x) + 0.5f)/float(textureSize(data9, 0).x), float(float(int(float(idx0)+float(((-33600))))/textureSize(data9, 0).x) + 0.5f)/float(textureSize(data9, 0).y))).r):(0.0);
  float alu11 = float((float(float(float(val0)+float(val1))+float((float(val2)+float(val3))))+float((float(val4)+float(val5)))));
  float alu12 = float((float(float(float(val8)+float(val9))+float((float(val10)+float(val11))))+float((float(val12)+float(val13)))));
  out_data = float((float((float((float((float((float((alu11-val6))+float((float(alu11)+float(val7)))))*float((float(alu3)!=0.0?(0.5):(0.0)))))+float(((float(alu12)+float(val14))-(alu12-val15)))))*float(val16)))+float(val17)));
}`;
const buf_0 = createTexture(gl, 80.0, false);;
    const buf_1 = createTexture(gl, 80.0, false);;
    const buf_2 = createTexture(gl, 40.0, false);;
    const buf_3 = createTexture(gl, 40.0, false);;
    const buf_4 = createTexture(gl, 20.0, false);;
    const buf_5 = createTexture(gl, 20.0, false);;
    const buf_6 = createTexture(gl, 1638400.0, false);;
    const input0 = createTexture(gl, 1228800.0, false);;
    const buf_7 = createTexture(gl, 432.0, true, getTensorBuffer(safetensor, metadata['net.b1.0.conv.weight']));
    const buf_8 = createTexture(gl, 16.0, true, getTensorBuffer(safetensor, metadata['net.b1.0.bn.running_mean']));
    const buf_9 = createTexture(gl, 16.0, true, getTensorBuffer(safetensor, metadata['net.b1.0.bn.weight']));
    const buf_10 = createTexture(gl, 16.0, true, getTensorBuffer(safetensor, metadata['net.b1.0.bn.running_var']));
    const buf_11 = createTexture(gl, 16.0, true, getTensorBuffer(safetensor, metadata['net.b1.0.bn.bias']));
    const buf_12 = createTexture(gl, 819200.0, false);;
    const buf_13 = createTexture(gl, 4608.0, true, getTensorBuffer(safetensor, metadata['net.b1.1.conv.weight']));
    const buf_14 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['net.b1.1.bn.running_mean']));
    const buf_15 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['net.b1.1.bn.weight']));
    const buf_16 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['net.b1.1.bn.running_var']));
    const buf_17 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['net.b1.1.bn.bias']));
    const buf_18 = createTexture(gl, 819200.0, false);;
    const buf_19 = createTexture(gl, 1024.0, true, getTensorBuffer(safetensor, metadata['net.b2.0.cv1.conv.weight']));
    const buf_20 = createTexture(gl, 409600.0, false);;
    const buf_21 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['net.b2.0.cv1.bn.running_mean']));
    const buf_22 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['net.b2.0.cv1.bn.weight']));
    const buf_23 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['net.b2.0.cv1.bn.running_var']));
    const buf_24 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['net.b2.0.cv1.bn.bias']));
    const buf_25 = createTexture(gl, 409600.0, false);;
    const buf_26 = createTexture(gl, 409600.0, false);;
    const buf_27 = createTexture(gl, 2304.0, true, getTensorBuffer(safetensor, metadata['net.b2.0.bottleneck.0.cv1.conv.weight']));
    const buf_28 = createTexture(gl, 16.0, true, getTensorBuffer(safetensor, metadata['net.b2.0.bottleneck.0.cv1.bn.running_mean']));
    const buf_29 = createTexture(gl, 16.0, true, getTensorBuffer(safetensor, metadata['net.b2.0.bottleneck.0.cv1.bn.weight']));
    const buf_30 = createTexture(gl, 16.0, true, getTensorBuffer(safetensor, metadata['net.b2.0.bottleneck.0.cv1.bn.running_var']));
    const buf_31 = createTexture(gl, 16.0, true, getTensorBuffer(safetensor, metadata['net.b2.0.bottleneck.0.cv1.bn.bias']));
    const buf_32 = createTexture(gl, 409600.0, false);;
    const buf_33 = createTexture(gl, 2304.0, true, getTensorBuffer(safetensor, metadata['net.b2.0.bottleneck.0.cv2.conv.weight']));
    const buf_34 = createTexture(gl, 16.0, true, getTensorBuffer(safetensor, metadata['net.b2.0.bottleneck.0.cv2.bn.running_mean']));
    const buf_35 = createTexture(gl, 16.0, true, getTensorBuffer(safetensor, metadata['net.b2.0.bottleneck.0.cv2.bn.weight']));
    const buf_36 = createTexture(gl, 16.0, true, getTensorBuffer(safetensor, metadata['net.b2.0.bottleneck.0.cv2.bn.running_var']));
    const buf_37 = createTexture(gl, 16.0, true, getTensorBuffer(safetensor, metadata['net.b2.0.bottleneck.0.cv2.bn.bias']));
    const buf_38 = createTexture(gl, 1228800.0, false);;
    const buf_39 = createTexture(gl, 1536.0, true, getTensorBuffer(safetensor, metadata['net.b2.0.cv2.conv.weight']));
    const buf_40 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['net.b2.0.cv2.bn.running_mean']));
    const buf_41 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['net.b2.0.cv2.bn.weight']));
    const buf_42 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['net.b2.0.cv2.bn.running_var']));
    const buf_43 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['net.b2.0.cv2.bn.bias']));
    const buf_44 = createTexture(gl, 18432.0, true, getTensorBuffer(safetensor, metadata['net.b2.1.conv.weight']));
    const buf_45 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['net.b2.1.bn.running_mean']));
    const buf_46 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['net.b2.1.bn.weight']));
    const buf_47 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['net.b2.1.bn.running_var']));
    const buf_48 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['net.b2.1.bn.bias']));
    const buf_49 = createTexture(gl, 4096.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.cv1.conv.weight']));
    const buf_50 = createTexture(gl, 204800.0, false);;
    const buf_51 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.cv1.bn.running_mean']));
    const buf_52 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.cv1.bn.weight']));
    const buf_53 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.cv1.bn.running_var']));
    const buf_54 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.cv1.bn.bias']));
    const buf_55 = createTexture(gl, 204800.0, false);;
    const buf_56 = createTexture(gl, 204800.0, false);;
    const buf_57 = createTexture(gl, 9216.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.bottleneck.0.cv1.conv.weight']));
    const buf_58 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.bottleneck.0.cv1.bn.running_mean']));
    const buf_59 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.bottleneck.0.cv1.bn.weight']));
    const buf_60 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.bottleneck.0.cv1.bn.running_var']));
    const buf_61 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.bottleneck.0.cv1.bn.bias']));
    const buf_62 = createTexture(gl, 204800.0, false);;
    const buf_63 = createTexture(gl, 9216.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.bottleneck.0.cv2.conv.weight']));
    const buf_64 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.bottleneck.0.cv2.bn.running_mean']));
    const buf_65 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.bottleneck.0.cv2.bn.weight']));
    const buf_66 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.bottleneck.0.cv2.bn.running_var']));
    const buf_67 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.bottleneck.0.cv2.bn.bias']));
    const buf_68 = createTexture(gl, 9216.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.bottleneck.1.cv1.conv.weight']));
    const buf_69 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.bottleneck.1.cv1.bn.running_mean']));
    const buf_70 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.bottleneck.1.cv1.bn.weight']));
    const buf_71 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.bottleneck.1.cv1.bn.running_var']));
    const buf_72 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.bottleneck.1.cv1.bn.bias']));
    const buf_73 = createTexture(gl, 204800.0, false);;
    const buf_74 = createTexture(gl, 9216.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.bottleneck.1.cv2.conv.weight']));
    const buf_75 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.bottleneck.1.cv2.bn.running_mean']));
    const buf_76 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.bottleneck.1.cv2.bn.weight']));
    const buf_77 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.bottleneck.1.cv2.bn.running_var']));
    const buf_78 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.bottleneck.1.cv2.bn.bias']));
    const buf_79 = createTexture(gl, 8192.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.cv2.conv.weight']));
    const buf_80 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.cv2.bn.running_mean']));
    const buf_81 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.cv2.bn.weight']));
    const buf_82 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.cv2.bn.running_var']));
    const buf_83 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.cv2.bn.bias']));
    const buf_84 = createTexture(gl, 73728.0, true, getTensorBuffer(safetensor, metadata['net.b3.0.conv.weight']));
    const buf_85 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['net.b3.0.bn.running_mean']));
    const buf_86 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['net.b3.0.bn.weight']));
    const buf_87 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['net.b3.0.bn.running_var']));
    const buf_88 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['net.b3.0.bn.bias']));
    const buf_89 = createTexture(gl, 16384.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.cv1.conv.weight']));
    const buf_90 = createTexture(gl, 102400.0, false);;
    const buf_91 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.cv1.bn.running_mean']));
    const buf_92 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.cv1.bn.weight']));
    const buf_93 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.cv1.bn.running_var']));
    const buf_94 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.cv1.bn.bias']));
    const buf_95 = createTexture(gl, 102400.0, false);;
    const buf_96 = createTexture(gl, 102400.0, false);;
    const buf_97 = createTexture(gl, 36864.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.bottleneck.0.cv1.conv.weight']));
    const buf_98 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.bottleneck.0.cv1.bn.running_mean']));
    const buf_99 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.bottleneck.0.cv1.bn.weight']));
    const buf_100 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.bottleneck.0.cv1.bn.running_var']));
    const buf_101 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.bottleneck.0.cv1.bn.bias']));
    const buf_102 = createTexture(gl, 102400.0, false);;
    const buf_103 = createTexture(gl, 36864.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.bottleneck.0.cv2.conv.weight']));
    const buf_104 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.bottleneck.0.cv2.bn.running_mean']));
    const buf_105 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.bottleneck.0.cv2.bn.weight']));
    const buf_106 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.bottleneck.0.cv2.bn.running_var']));
    const buf_107 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.bottleneck.0.cv2.bn.bias']));
    const buf_108 = createTexture(gl, 36864.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.bottleneck.1.cv1.conv.weight']));
    const buf_109 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.bottleneck.1.cv1.bn.running_mean']));
    const buf_110 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.bottleneck.1.cv1.bn.weight']));
    const buf_111 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.bottleneck.1.cv1.bn.running_var']));
    const buf_112 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.bottleneck.1.cv1.bn.bias']));
    const buf_113 = createTexture(gl, 102400.0, false);;
    const buf_114 = createTexture(gl, 36864.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.bottleneck.1.cv2.conv.weight']));
    const buf_115 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.bottleneck.1.cv2.bn.running_mean']));
    const buf_116 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.bottleneck.1.cv2.bn.weight']));
    const buf_117 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.bottleneck.1.cv2.bn.running_var']));
    const buf_118 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.bottleneck.1.cv2.bn.bias']));
    const buf_119 = createTexture(gl, 32768.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.cv2.conv.weight']));
    const buf_120 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.cv2.bn.running_mean']));
    const buf_121 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.cv2.bn.weight']));
    const buf_122 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.cv2.bn.running_var']));
    const buf_123 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.cv2.bn.bias']));
    const buf_124 = createTexture(gl, 294912.0, true, getTensorBuffer(safetensor, metadata['net.b4.0.conv.weight']));
    const buf_125 = createTexture(gl, 256.0, true, getTensorBuffer(safetensor, metadata['net.b4.0.bn.running_mean']));
    const buf_126 = createTexture(gl, 256.0, true, getTensorBuffer(safetensor, metadata['net.b4.0.bn.weight']));
    const buf_127 = createTexture(gl, 256.0, true, getTensorBuffer(safetensor, metadata['net.b4.0.bn.running_var']));
    const buf_128 = createTexture(gl, 256.0, true, getTensorBuffer(safetensor, metadata['net.b4.0.bn.bias']));
    const buf_129 = createTexture(gl, 65536.0, true, getTensorBuffer(safetensor, metadata['net.b4.1.cv1.conv.weight']));
    const buf_130 = createTexture(gl, 51200.0, false);;
    const buf_131 = createTexture(gl, 256.0, true, getTensorBuffer(safetensor, metadata['net.b4.1.cv1.bn.running_mean']));
    const buf_132 = createTexture(gl, 256.0, true, getTensorBuffer(safetensor, metadata['net.b4.1.cv1.bn.weight']));
    const buf_133 = createTexture(gl, 256.0, true, getTensorBuffer(safetensor, metadata['net.b4.1.cv1.bn.running_var']));
    const buf_134 = createTexture(gl, 256.0, true, getTensorBuffer(safetensor, metadata['net.b4.1.cv1.bn.bias']));
    const buf_135 = createTexture(gl, 51200.0, false);;
    const buf_136 = createTexture(gl, 51200.0, false);;
    const buf_137 = createTexture(gl, 147456.0, true, getTensorBuffer(safetensor, metadata['net.b4.1.bottleneck.0.cv1.conv.weight']));
    const buf_138 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['net.b4.1.bottleneck.0.cv1.bn.running_mean']));
    const buf_139 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['net.b4.1.bottleneck.0.cv1.bn.weight']));
    const buf_140 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['net.b4.1.bottleneck.0.cv1.bn.running_var']));
    const buf_141 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['net.b4.1.bottleneck.0.cv1.bn.bias']));
    const buf_142 = createTexture(gl, 51200.0, false);;
    const buf_143 = createTexture(gl, 147456.0, true, getTensorBuffer(safetensor, metadata['net.b4.1.bottleneck.0.cv2.conv.weight']));
    const buf_144 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['net.b4.1.bottleneck.0.cv2.bn.running_mean']));
    const buf_145 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['net.b4.1.bottleneck.0.cv2.bn.weight']));
    const buf_146 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['net.b4.1.bottleneck.0.cv2.bn.running_var']));
    const buf_147 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['net.b4.1.bottleneck.0.cv2.bn.bias']));
    const buf_148 = createTexture(gl, 153600.0, false);;
    const buf_149 = createTexture(gl, 98304.0, true, getTensorBuffer(safetensor, metadata['net.b4.1.cv2.conv.weight']));
    const buf_150 = createTexture(gl, 256.0, true, getTensorBuffer(safetensor, metadata['net.b4.1.cv2.bn.running_mean']));
    const buf_151 = createTexture(gl, 256.0, true, getTensorBuffer(safetensor, metadata['net.b4.1.cv2.bn.weight']));
    const buf_152 = createTexture(gl, 256.0, true, getTensorBuffer(safetensor, metadata['net.b4.1.cv2.bn.running_var']));
    const buf_153 = createTexture(gl, 256.0, true, getTensorBuffer(safetensor, metadata['net.b4.1.cv2.bn.bias']));
    const buf_154 = createTexture(gl, 32768.0, true, getTensorBuffer(safetensor, metadata['net.b5.0.cv1.conv.weight']));
    const buf_155 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['net.b5.0.cv1.bn.running_mean']));
    const buf_156 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['net.b5.0.cv1.bn.weight']));
    const buf_157 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['net.b5.0.cv1.bn.running_var']));
    const buf_158 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['net.b5.0.cv1.bn.bias']));
    const buf_159 = createTexture(gl, 131072.0, true, getTensorBuffer(safetensor, metadata['net.b5.0.cv2.conv.weight']));
    const buf_160 = createTexture(gl, 256.0, true, getTensorBuffer(safetensor, metadata['net.b5.0.cv2.bn.running_mean']));
    const buf_161 = createTexture(gl, 256.0, true, getTensorBuffer(safetensor, metadata['net.b5.0.cv2.bn.weight']));
    const buf_162 = createTexture(gl, 256.0, true, getTensorBuffer(safetensor, metadata['net.b5.0.cv2.bn.running_var']));
    const buf_163 = createTexture(gl, 256.0, true, getTensorBuffer(safetensor, metadata['net.b5.0.cv2.bn.bias']));
    const buf_164 = createTexture(gl, 614400.0, false);;
    const buf_165 = createTexture(gl, 49152.0, true, getTensorBuffer(safetensor, metadata['fpn.n1.cv1.conv.weight']));
    const buf_166 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['fpn.n1.cv1.bn.running_mean']));
    const buf_167 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['fpn.n1.cv1.bn.weight']));
    const buf_168 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['fpn.n1.cv1.bn.running_var']));
    const buf_169 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['fpn.n1.cv1.bn.bias']));
    const buf_170 = createTexture(gl, 36864.0, true, getTensorBuffer(safetensor, metadata['fpn.n1.bottleneck.0.cv1.conv.weight']));
    const buf_171 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['fpn.n1.bottleneck.0.cv1.bn.running_mean']));
    const buf_172 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['fpn.n1.bottleneck.0.cv1.bn.weight']));
    const buf_173 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['fpn.n1.bottleneck.0.cv1.bn.running_var']));
    const buf_174 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['fpn.n1.bottleneck.0.cv1.bn.bias']));
    const buf_175 = createTexture(gl, 36864.0, true, getTensorBuffer(safetensor, metadata['fpn.n1.bottleneck.0.cv2.conv.weight']));
    const buf_176 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['fpn.n1.bottleneck.0.cv2.bn.running_mean']));
    const buf_177 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['fpn.n1.bottleneck.0.cv2.bn.weight']));
    const buf_178 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['fpn.n1.bottleneck.0.cv2.bn.running_var']));
    const buf_179 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['fpn.n1.bottleneck.0.cv2.bn.bias']));
    const buf_180 = createTexture(gl, 307200.0, false);;
    const buf_181 = createTexture(gl, 24576.0, true, getTensorBuffer(safetensor, metadata['fpn.n1.cv2.conv.weight']));
    const buf_182 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['fpn.n1.cv2.bn.running_mean']));
    const buf_183 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['fpn.n1.cv2.bn.weight']));
    const buf_184 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['fpn.n1.cv2.bn.running_var']));
    const buf_185 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['fpn.n1.cv2.bn.bias']));
    const buf_186 = createTexture(gl, 12288.0, true, getTensorBuffer(safetensor, metadata['fpn.n2.cv1.conv.weight']));
    const buf_187 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['fpn.n2.cv1.bn.running_mean']));
    const buf_188 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['fpn.n2.cv1.bn.weight']));
    const buf_189 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['fpn.n2.cv1.bn.running_var']));
    const buf_190 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['fpn.n2.cv1.bn.bias']));
    const buf_191 = createTexture(gl, 9216.0, true, getTensorBuffer(safetensor, metadata['fpn.n2.bottleneck.0.cv1.conv.weight']));
    const buf_192 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['fpn.n2.bottleneck.0.cv1.bn.running_mean']));
    const buf_193 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['fpn.n2.bottleneck.0.cv1.bn.weight']));
    const buf_194 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['fpn.n2.bottleneck.0.cv1.bn.running_var']));
    const buf_195 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['fpn.n2.bottleneck.0.cv1.bn.bias']));
    const buf_196 = createTexture(gl, 9216.0, true, getTensorBuffer(safetensor, metadata['fpn.n2.bottleneck.0.cv2.conv.weight']));
    const buf_197 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['fpn.n2.bottleneck.0.cv2.bn.running_mean']));
    const buf_198 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['fpn.n2.bottleneck.0.cv2.bn.weight']));
    const buf_199 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['fpn.n2.bottleneck.0.cv2.bn.running_var']));
    const buf_200 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['fpn.n2.bottleneck.0.cv2.bn.bias']));
    const buf_201 = createTexture(gl, 6144.0, true, getTensorBuffer(safetensor, metadata['fpn.n2.cv2.conv.weight']));
    const buf_202 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['fpn.n2.cv2.bn.running_mean']));
    const buf_203 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['fpn.n2.cv2.bn.weight']));
    const buf_204 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['fpn.n2.cv2.bn.running_var']));
    const buf_205 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['fpn.n2.cv2.bn.bias']));
    const buf_206 = createTexture(gl, 36864.0, true, getTensorBuffer(safetensor, metadata['head.cv2.0.0.conv.weight']));
    const buf_207 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['head.cv2.0.0.bn.running_mean']));
    const buf_208 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['head.cv2.0.0.bn.weight']));
    const buf_209 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['head.cv2.0.0.bn.running_var']));
    const buf_210 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['head.cv2.0.0.bn.bias']));
    const buf_211 = createTexture(gl, 36864.0, true, getTensorBuffer(safetensor, metadata['head.cv2.0.1.conv.weight']));
    const buf_212 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['head.cv2.0.1.bn.running_mean']));
    const buf_213 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['head.cv2.0.1.bn.weight']));
    const buf_214 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['head.cv2.0.1.bn.running_var']));
    const buf_215 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['head.cv2.0.1.bn.bias']));
    const buf_216 = createTexture(gl, 4096.0, true, getTensorBuffer(safetensor, metadata['head.cv2.0.2.weight']));
    const buf_217 = createTexture(gl, 512000.0, false);;
    const buf_218 = createTexture(gl, 46080.0, true, getTensorBuffer(safetensor, metadata['head.cv3.0.0.conv.weight']));
    const buf_219 = createTexture(gl, 80.0, true, getTensorBuffer(safetensor, metadata['head.cv3.0.0.bn.running_mean']));
    const buf_220 = createTexture(gl, 80.0, true, getTensorBuffer(safetensor, metadata['head.cv3.0.0.bn.weight']));
    const buf_221 = createTexture(gl, 80.0, true, getTensorBuffer(safetensor, metadata['head.cv3.0.0.bn.running_var']));
    const buf_222 = createTexture(gl, 80.0, true, getTensorBuffer(safetensor, metadata['head.cv3.0.0.bn.bias']));
    const buf_223 = createTexture(gl, 512000.0, false);;
    const buf_224 = createTexture(gl, 57600.0, true, getTensorBuffer(safetensor, metadata['head.cv3.0.1.conv.weight']));
    const buf_225 = createTexture(gl, 80.0, true, getTensorBuffer(safetensor, metadata['head.cv3.0.1.bn.running_mean']));
    const buf_226 = createTexture(gl, 80.0, true, getTensorBuffer(safetensor, metadata['head.cv3.0.1.bn.weight']));
    const buf_227 = createTexture(gl, 80.0, true, getTensorBuffer(safetensor, metadata['head.cv3.0.1.bn.running_var']));
    const buf_228 = createTexture(gl, 80.0, true, getTensorBuffer(safetensor, metadata['head.cv3.0.1.bn.bias']));
    const buf_229 = createTexture(gl, 6400.0, true, getTensorBuffer(safetensor, metadata['head.cv3.0.2.weight']));
    const buf_230 = createTexture(gl, 36864.0, true, getTensorBuffer(safetensor, metadata['fpn.n3.conv.weight']));
    const buf_231 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['fpn.n3.bn.running_mean']));
    const buf_232 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['fpn.n3.bn.weight']));
    const buf_233 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['fpn.n3.bn.running_var']));
    const buf_234 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['fpn.n3.bn.bias']));
    const buf_235 = createTexture(gl, 24576.0, true, getTensorBuffer(safetensor, metadata['fpn.n4.cv1.conv.weight']));
    const buf_236 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['fpn.n4.cv1.bn.running_mean']));
    const buf_237 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['fpn.n4.cv1.bn.weight']));
    const buf_238 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['fpn.n4.cv1.bn.running_var']));
    const buf_239 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['fpn.n4.cv1.bn.bias']));
    const buf_240 = createTexture(gl, 36864.0, true, getTensorBuffer(safetensor, metadata['fpn.n4.bottleneck.0.cv1.conv.weight']));
    const buf_241 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['fpn.n4.bottleneck.0.cv1.bn.running_mean']));
    const buf_242 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['fpn.n4.bottleneck.0.cv1.bn.weight']));
    const buf_243 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['fpn.n4.bottleneck.0.cv1.bn.running_var']));
    const buf_244 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['fpn.n4.bottleneck.0.cv1.bn.bias']));
    const buf_245 = createTexture(gl, 36864.0, true, getTensorBuffer(safetensor, metadata['fpn.n4.bottleneck.0.cv2.conv.weight']));
    const buf_246 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['fpn.n4.bottleneck.0.cv2.bn.running_mean']));
    const buf_247 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['fpn.n4.bottleneck.0.cv2.bn.weight']));
    const buf_248 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['fpn.n4.bottleneck.0.cv2.bn.running_var']));
    const buf_249 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['fpn.n4.bottleneck.0.cv2.bn.bias']));
    const buf_250 = createTexture(gl, 24576.0, true, getTensorBuffer(safetensor, metadata['fpn.n4.cv2.conv.weight']));
    const buf_251 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['fpn.n4.cv2.bn.running_mean']));
    const buf_252 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['fpn.n4.cv2.bn.weight']));
    const buf_253 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['fpn.n4.cv2.bn.running_var']));
    const buf_254 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['fpn.n4.cv2.bn.bias']));
    const buf_255 = createTexture(gl, 73728.0, true, getTensorBuffer(safetensor, metadata['head.cv2.1.0.conv.weight']));
    const buf_256 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['head.cv2.1.0.bn.running_mean']));
    const buf_257 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['head.cv2.1.0.bn.weight']));
    const buf_258 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['head.cv2.1.0.bn.running_var']));
    const buf_259 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['head.cv2.1.0.bn.bias']));
    const buf_260 = createTexture(gl, 36864.0, true, getTensorBuffer(safetensor, metadata['head.cv2.1.1.conv.weight']));
    const buf_261 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['head.cv2.1.1.bn.running_mean']));
    const buf_262 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['head.cv2.1.1.bn.weight']));
    const buf_263 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['head.cv2.1.1.bn.running_var']));
    const buf_264 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['head.cv2.1.1.bn.bias']));
    const buf_265 = createTexture(gl, 4096.0, true, getTensorBuffer(safetensor, metadata['head.cv2.1.2.weight']));
    const buf_266 = createTexture(gl, 128000.0, false);;
    const buf_267 = createTexture(gl, 92160.0, true, getTensorBuffer(safetensor, metadata['head.cv3.1.0.conv.weight']));
    const buf_268 = createTexture(gl, 80.0, true, getTensorBuffer(safetensor, metadata['head.cv3.1.0.bn.running_mean']));
    const buf_269 = createTexture(gl, 80.0, true, getTensorBuffer(safetensor, metadata['head.cv3.1.0.bn.weight']));
    const buf_270 = createTexture(gl, 80.0, true, getTensorBuffer(safetensor, metadata['head.cv3.1.0.bn.running_var']));
    const buf_271 = createTexture(gl, 80.0, true, getTensorBuffer(safetensor, metadata['head.cv3.1.0.bn.bias']));
    const buf_272 = createTexture(gl, 128000.0, false);;
    const buf_273 = createTexture(gl, 57600.0, true, getTensorBuffer(safetensor, metadata['head.cv3.1.1.conv.weight']));
    const buf_274 = createTexture(gl, 80.0, true, getTensorBuffer(safetensor, metadata['head.cv3.1.1.bn.running_mean']));
    const buf_275 = createTexture(gl, 80.0, true, getTensorBuffer(safetensor, metadata['head.cv3.1.1.bn.weight']));
    const buf_276 = createTexture(gl, 80.0, true, getTensorBuffer(safetensor, metadata['head.cv3.1.1.bn.running_var']));
    const buf_277 = createTexture(gl, 80.0, true, getTensorBuffer(safetensor, metadata['head.cv3.1.1.bn.bias']));
    const buf_278 = createTexture(gl, 6400.0, true, getTensorBuffer(safetensor, metadata['head.cv3.1.2.weight']));
    const buf_279 = createTexture(gl, 147456.0, true, getTensorBuffer(safetensor, metadata['fpn.n5.conv.weight']));
    const buf_280 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['fpn.n5.bn.running_mean']));
    const buf_281 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['fpn.n5.bn.weight']));
    const buf_282 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['fpn.n5.bn.running_var']));
    const buf_283 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['fpn.n5.bn.bias']));
    const buf_284 = createTexture(gl, 98304.0, true, getTensorBuffer(safetensor, metadata['fpn.n6.cv1.conv.weight']));
    const buf_285 = createTexture(gl, 256.0, true, getTensorBuffer(safetensor, metadata['fpn.n6.cv1.bn.running_mean']));
    const buf_286 = createTexture(gl, 256.0, true, getTensorBuffer(safetensor, metadata['fpn.n6.cv1.bn.weight']));
    const buf_287 = createTexture(gl, 256.0, true, getTensorBuffer(safetensor, metadata['fpn.n6.cv1.bn.running_var']));
    const buf_288 = createTexture(gl, 256.0, true, getTensorBuffer(safetensor, metadata['fpn.n6.cv1.bn.bias']));
    const buf_289 = createTexture(gl, 147456.0, true, getTensorBuffer(safetensor, metadata['fpn.n6.bottleneck.0.cv1.conv.weight']));
    const buf_290 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['fpn.n6.bottleneck.0.cv1.bn.running_mean']));
    const buf_291 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['fpn.n6.bottleneck.0.cv1.bn.weight']));
    const buf_292 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['fpn.n6.bottleneck.0.cv1.bn.running_var']));
    const buf_293 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['fpn.n6.bottleneck.0.cv1.bn.bias']));
    const buf_294 = createTexture(gl, 147456.0, true, getTensorBuffer(safetensor, metadata['fpn.n6.bottleneck.0.cv2.conv.weight']));
    const buf_295 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['fpn.n6.bottleneck.0.cv2.bn.running_mean']));
    const buf_296 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['fpn.n6.bottleneck.0.cv2.bn.weight']));
    const buf_297 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['fpn.n6.bottleneck.0.cv2.bn.running_var']));
    const buf_298 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['fpn.n6.bottleneck.0.cv2.bn.bias']));
    const buf_299 = createTexture(gl, 98304.0, true, getTensorBuffer(safetensor, metadata['fpn.n6.cv2.conv.weight']));
    const buf_300 = createTexture(gl, 256.0, true, getTensorBuffer(safetensor, metadata['fpn.n6.cv2.bn.running_mean']));
    const buf_301 = createTexture(gl, 256.0, true, getTensorBuffer(safetensor, metadata['fpn.n6.cv2.bn.weight']));
    const buf_302 = createTexture(gl, 256.0, true, getTensorBuffer(safetensor, metadata['fpn.n6.cv2.bn.running_var']));
    const buf_303 = createTexture(gl, 256.0, true, getTensorBuffer(safetensor, metadata['fpn.n6.cv2.bn.bias']));
    const buf_304 = createTexture(gl, 25600.0, false);;
    const buf_305 = createTexture(gl, 147456.0, true, getTensorBuffer(safetensor, metadata['head.cv2.2.0.conv.weight']));
    const buf_306 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['head.cv2.2.0.bn.running_mean']));
    const buf_307 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['head.cv2.2.0.bn.weight']));
    const buf_308 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['head.cv2.2.0.bn.running_var']));
    const buf_309 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['head.cv2.2.0.bn.bias']));
    const buf_310 = createTexture(gl, 25600.0, false);;
    const buf_311 = createTexture(gl, 36864.0, true, getTensorBuffer(safetensor, metadata['head.cv2.2.1.conv.weight']));
    const buf_312 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['head.cv2.2.1.bn.running_mean']));
    const buf_313 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['head.cv2.2.1.bn.weight']));
    const buf_314 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['head.cv2.2.1.bn.running_var']));
    const buf_315 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['head.cv2.2.1.bn.bias']));
    const buf_316 = createTexture(gl, 4096.0, true, getTensorBuffer(safetensor, metadata['head.cv2.2.2.weight']));
    const buf_317 = createTexture(gl, 32000.0, false);;
    const buf_318 = createTexture(gl, 184320.0, true, getTensorBuffer(safetensor, metadata['head.cv3.2.0.conv.weight']));
    const buf_319 = createTexture(gl, 80.0, true, getTensorBuffer(safetensor, metadata['head.cv3.2.0.bn.running_mean']));
    const buf_320 = createTexture(gl, 80.0, true, getTensorBuffer(safetensor, metadata['head.cv3.2.0.bn.weight']));
    const buf_321 = createTexture(gl, 80.0, true, getTensorBuffer(safetensor, metadata['head.cv3.2.0.bn.running_var']));
    const buf_322 = createTexture(gl, 80.0, true, getTensorBuffer(safetensor, metadata['head.cv3.2.0.bn.bias']));
    const buf_323 = createTexture(gl, 32000.0, false);;
    const buf_324 = createTexture(gl, 57600.0, true, getTensorBuffer(safetensor, metadata['head.cv3.2.1.conv.weight']));
    const buf_325 = createTexture(gl, 80.0, true, getTensorBuffer(safetensor, metadata['head.cv3.2.1.bn.running_mean']));
    const buf_326 = createTexture(gl, 80.0, true, getTensorBuffer(safetensor, metadata['head.cv3.2.1.bn.weight']));
    const buf_327 = createTexture(gl, 80.0, true, getTensorBuffer(safetensor, metadata['head.cv3.2.1.bn.running_var']));
    const buf_328 = createTexture(gl, 80.0, true, getTensorBuffer(safetensor, metadata['head.cv3.2.1.bn.bias']));
    const buf_329 = createTexture(gl, 6400.0, true, getTensorBuffer(safetensor, metadata['head.cv3.2.2.weight']));
    const buf_330 = createTexture(gl, 537600.0, false);;
    const buf_331 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['head.cv2.0.2.bias']));
    const buf_332 = createTexture(gl, 80.0, true, getTensorBuffer(safetensor, metadata['head.cv3.0.2.bias']));
    const buf_333 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['head.cv2.1.2.bias']));
    const buf_334 = createTexture(gl, 80.0, true, getTensorBuffer(safetensor, metadata['head.cv3.1.2.bias']));
    const buf_335 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['head.cv2.2.2.bias']));
    const buf_336 = createTexture(gl, 80.0, true, getTensorBuffer(safetensor, metadata['head.cv3.2.2.bias']));
    const buf_337 = createTexture(gl, 33600.0, false);;
    const buf_338 = createTexture(gl, 537600.0, false);;
    const buf_339 = createTexture(gl, 33600.0, false);;
    const buf_340 = createTexture(gl, 16.0, true, getTensorBuffer(safetensor, metadata['head.dfl.conv.weight']));
    const buf_341 = createTexture(gl, 8400.0, false, getTensorBuffer(safetensor, metadata['head.strides']));
    const buf_342 = createTexture(gl, 672000.0, false);;
    const output0 = createTexture(gl, 705600.0, false);;
let programs = [r_80_80, r_80_80, r_40_40, r_40_40, r_20_20, r_20_20, r_16_320_320_3_3_3, r_32_160_160_16_3_3, r_32_25600_32, E_16_25600, E_16_25600n1, r_16_160_160_16_3_3, r_16_160_160_16_3_3n1, E_48_25600, r_32_25600_48, r_64_80_80_32_3_3, r_64_6400_64, E_32_6400, E_32_6400n1, r_32_80_80_32_3_3, r_32_80_80_32_3_3n1, r_32_80_80_32_3_3, r_32_80_80_32_3_3n1, E_128_6400, r_64_6400_128, r_128_40_40_64_3_3, r_128_1600_128, E_64_1600, E_64_1600n1, r_64_40_40_64_3_3, r_64_40_40_64_3_3n1, r_64_40_40_64_3_3, r_64_40_40_64_3_3n1, E_256_1600, r_128_1600_256, r_256_20_20_128_3_3, r_256_400_256, E_128_400, E_128_400n1, r_128_20_20_128_3_3, r_128_20_20_128_3_3n1, E_384_400, r_256_400_384, r_128_400_256, r_128_20_20_5_5, r_128_20_20_5_5, r_128_20_20_5_5, E_512_400, r_256_400_512, E_384_40_40, r_128_1600_384, E_64_1600, E_64_1600n1, r_64_40_40_64_3_3, r_64_40_40_64_3_3, E_192_1600, r_128_1600_192, E_192_80_80, r_64_6400_192, E_32_6400, E_32_6400n1, r_32_80_80_32_3_3, r_32_80_80_32_3_3, E_96_6400, r_64_6400_96, r_64_80_80_64_3_3, r_64_80_80_64_3_3, r_64_6400_64, r_80_80_80_64_3_3, r_80_80_80_80_3_3, r_80_6400_80, r_64_40_40_64_3_3n2, E_192_1600n1, r_128_1600_192n1, E_64_1600, E_64_1600n1, r_64_40_40_64_3_3, r_64_40_40_64_3_3, E_192_1600, r_128_1600_192, r_64_40_40_128_3_3, r_64_40_40_64_3_3, r_64_1600_64, r_80_40_40_128_3_3, r_80_40_40_80_3_3, r_80_1600_80, r_128_20_20_128_3_3n2, E_384_400n1, r_256_400_384n1, E_128_400, E_128_400n1, r_128_20_20_128_3_3, r_128_20_20_128_3_3, E_384_400, r_256_400_384, r_64_20_20_256_3_3, r_64_20_20_64_3_3, r_64_400_64, r_80_20_20_256_3_3, r_80_20_20_80_3_3, r_80_400_80, E_16_4_8400, r_33600_16, E_16_33600, r_33600_16n1, r_33600_16n2, E_8400, E_80_8400, E_84_8400].map((code) => createShaderProgram(gl, code));

    return function(_input0) {
      const ext = gl.getExtension('EXT_color_buffer_float');
      updateTextureData(gl, input0, _input0, false);
      runProgram(gl, 'r_80_80', programs[0], [buf_0]);
        runProgram(gl, 'r_80_80', programs[1], [buf_1]);
        runProgram(gl, 'r_40_40', programs[2], [buf_2]);
        runProgram(gl, 'r_40_40', programs[3], [buf_3]);
        runProgram(gl, 'r_20_20', programs[4], [buf_4]);
        runProgram(gl, 'r_20_20', programs[5], [buf_5]);
        runProgram(gl, 'r_16_320_320_3_3_3', programs[6], [buf_6, input0, buf_7, buf_8, buf_9, buf_10, buf_11]);
        runProgram(gl, 'r_32_160_160_16_3_3', programs[7], [buf_12, buf_6, buf_13, buf_14, buf_15, buf_16, buf_17]);
        runProgram(gl, 'r_32_25600_32', programs[8], [buf_18, buf_12, buf_19]);
        runProgram(gl, 'E_16_25600', programs[9], [buf_20, buf_18, buf_21, buf_22, buf_23, buf_24]);
        runProgram(gl, 'E_16_25600n1', programs[10], [buf_25, buf_18, buf_21, buf_22, buf_23, buf_24]);
        runProgram(gl, 'r_16_160_160_16_3_3', programs[11], [buf_26, buf_25, buf_27, buf_28, buf_29, buf_30, buf_31]);
        runProgram(gl, 'r_16_160_160_16_3_3n1', programs[12], [buf_32, buf_25, buf_26, buf_33, buf_34, buf_35, buf_36, buf_37]);
        runProgram(gl, 'E_48_25600', programs[13], [buf_38, buf_20, buf_25, buf_32]);
        runProgram(gl, 'r_32_25600_48', programs[14], [buf_18, buf_38, buf_39, buf_40, buf_41, buf_42, buf_43]);
        runProgram(gl, 'r_64_80_80_32_3_3', programs[15], [buf_20, buf_18, buf_44, buf_45, buf_46, buf_47, buf_48]);
        runProgram(gl, 'r_64_6400_64', programs[16], [buf_25, buf_20, buf_49]);
        runProgram(gl, 'E_32_6400', programs[17], [buf_50, buf_25, buf_51, buf_52, buf_53, buf_54]);
        runProgram(gl, 'E_32_6400n1', programs[18], [buf_55, buf_25, buf_51, buf_52, buf_53, buf_54]);
        runProgram(gl, 'r_32_80_80_32_3_3', programs[19], [buf_56, buf_55, buf_57, buf_58, buf_59, buf_60, buf_61]);
        runProgram(gl, 'r_32_80_80_32_3_3n1', programs[20], [buf_62, buf_55, buf_56, buf_63, buf_64, buf_65, buf_66, buf_67]);
        runProgram(gl, 'r_32_80_80_32_3_3', programs[21], [buf_56, buf_62, buf_68, buf_69, buf_70, buf_71, buf_72]);
        runProgram(gl, 'r_32_80_80_32_3_3n1', programs[22], [buf_73, buf_62, buf_56, buf_74, buf_75, buf_76, buf_77, buf_78]);
        runProgram(gl, 'E_128_6400', programs[23], [buf_18, buf_50, buf_55, buf_62, buf_73]);
        runProgram(gl, 'r_64_6400_128', programs[24], [buf_25, buf_18, buf_79, buf_80, buf_81, buf_82, buf_83]);
        runProgram(gl, 'r_128_40_40_64_3_3', programs[25], [buf_50, buf_25, buf_84, buf_85, buf_86, buf_87, buf_88]);
        runProgram(gl, 'r_128_1600_128', programs[26], [buf_55, buf_50, buf_89]);
        runProgram(gl, 'E_64_1600', programs[27], [buf_90, buf_55, buf_91, buf_92, buf_93, buf_94]);
        runProgram(gl, 'E_64_1600n1', programs[28], [buf_95, buf_55, buf_91, buf_92, buf_93, buf_94]);
        runProgram(gl, 'r_64_40_40_64_3_3', programs[29], [buf_96, buf_95, buf_97, buf_98, buf_99, buf_100, buf_101]);
        runProgram(gl, 'r_64_40_40_64_3_3n1', programs[30], [buf_102, buf_95, buf_96, buf_103, buf_104, buf_105, buf_106, buf_107]);
        runProgram(gl, 'r_64_40_40_64_3_3', programs[31], [buf_96, buf_102, buf_108, buf_109, buf_110, buf_111, buf_112]);
        runProgram(gl, 'r_64_40_40_64_3_3n1', programs[32], [buf_113, buf_102, buf_96, buf_114, buf_115, buf_116, buf_117, buf_118]);
        runProgram(gl, 'E_256_1600', programs[33], [buf_20, buf_90, buf_95, buf_102, buf_113]);
        runProgram(gl, 'r_128_1600_256', programs[34], [buf_55, buf_20, buf_119, buf_120, buf_121, buf_122, buf_123]);
        runProgram(gl, 'r_256_20_20_128_3_3', programs[35], [buf_90, buf_55, buf_124, buf_125, buf_126, buf_127, buf_128]);
        runProgram(gl, 'r_256_400_256', programs[36], [buf_95, buf_90, buf_129]);
        runProgram(gl, 'E_128_400', programs[37], [buf_130, buf_95, buf_131, buf_132, buf_133, buf_134]);
        runProgram(gl, 'E_128_400n1', programs[38], [buf_135, buf_95, buf_131, buf_132, buf_133, buf_134]);
        runProgram(gl, 'r_128_20_20_128_3_3', programs[39], [buf_136, buf_135, buf_137, buf_138, buf_139, buf_140, buf_141]);
        runProgram(gl, 'r_128_20_20_128_3_3n1', programs[40], [buf_142, buf_135, buf_136, buf_143, buf_144, buf_145, buf_146, buf_147]);
        runProgram(gl, 'E_384_400', programs[41], [buf_148, buf_130, buf_135, buf_142]);
        runProgram(gl, 'r_256_400_384', programs[42], [buf_95, buf_148, buf_149, buf_150, buf_151, buf_152, buf_153]);
        runProgram(gl, 'r_128_400_256', programs[43], [buf_130, buf_95, buf_154, buf_155, buf_156, buf_157, buf_158]);
        runProgram(gl, 'r_128_20_20_5_5', programs[44], [buf_135, buf_130]);
        runProgram(gl, 'r_128_20_20_5_5', programs[45], [buf_142, buf_135]);
        runProgram(gl, 'r_128_20_20_5_5', programs[46], [buf_136, buf_142]);
        runProgram(gl, 'E_512_400', programs[47], [buf_50, buf_130, buf_135, buf_142, buf_136]);
        runProgram(gl, 'r_256_400_512', programs[48], [buf_95, buf_50, buf_159, buf_160, buf_161, buf_162, buf_163]);
        runProgram(gl, 'E_384_40_40', programs[49], [buf_164, buf_95, buf_55]);
        runProgram(gl, 'r_128_1600_384', programs[50], [buf_55, buf_164, buf_165]);
        runProgram(gl, 'E_64_1600', programs[51], [buf_90, buf_55, buf_166, buf_167, buf_168, buf_169]);
        runProgram(gl, 'E_64_1600n1', programs[52], [buf_102, buf_55, buf_166, buf_167, buf_168, buf_169]);
        runProgram(gl, 'r_64_40_40_64_3_3', programs[53], [buf_113, buf_102, buf_170, buf_171, buf_172, buf_173, buf_174]);
        runProgram(gl, 'r_64_40_40_64_3_3', programs[54], [buf_96, buf_113, buf_175, buf_176, buf_177, buf_178, buf_179]);
        runProgram(gl, 'E_192_1600', programs[55], [buf_180, buf_90, buf_102, buf_96]);
        runProgram(gl, 'r_128_1600_192', programs[56], [buf_55, buf_180, buf_181, buf_182, buf_183, buf_184, buf_185]);
        runProgram(gl, 'E_192_80_80', programs[57], [buf_38, buf_55, buf_25]);
        runProgram(gl, 'r_64_6400_192', programs[58], [buf_25, buf_38, buf_186]);
        runProgram(gl, 'E_32_6400', programs[59], [buf_50, buf_25, buf_187, buf_188, buf_189, buf_190]);
        runProgram(gl, 'E_32_6400n1', programs[60], [buf_62, buf_25, buf_187, buf_188, buf_189, buf_190]);
        runProgram(gl, 'r_32_80_80_32_3_3', programs[61], [buf_73, buf_62, buf_191, buf_192, buf_193, buf_194, buf_195]);
        runProgram(gl, 'r_32_80_80_32_3_3', programs[62], [buf_56, buf_73, buf_196, buf_197, buf_198, buf_199, buf_200]);
        runProgram(gl, 'E_96_6400', programs[63], [buf_164, buf_50, buf_62, buf_56]);
        runProgram(gl, 'r_64_6400_96', programs[64], [buf_25, buf_164, buf_201, buf_202, buf_203, buf_204, buf_205]);
        runProgram(gl, 'r_64_80_80_64_3_3', programs[65], [buf_20, buf_25, buf_206, buf_207, buf_208, buf_209, buf_210]);
        runProgram(gl, 'r_64_80_80_64_3_3', programs[66], [buf_32, buf_20, buf_211, buf_212, buf_213, buf_214, buf_215]);
        runProgram(gl, 'r_64_6400_64', programs[67], [buf_20, buf_32, buf_216]);
        runProgram(gl, 'r_80_80_80_64_3_3', programs[68], [buf_217, buf_25, buf_218, buf_219, buf_220, buf_221, buf_222]);
        runProgram(gl, 'r_80_80_80_80_3_3', programs[69], [buf_223, buf_217, buf_224, buf_225, buf_226, buf_227, buf_228]);
        runProgram(gl, 'r_80_6400_80', programs[70], [buf_217, buf_223, buf_229]);
        runProgram(gl, 'r_64_40_40_64_3_3n2', programs[71], [buf_90, buf_25, buf_230, buf_231, buf_232, buf_233, buf_234]);
        runProgram(gl, 'E_192_1600n1', programs[72], [buf_180, buf_90, buf_55]);
        runProgram(gl, 'r_128_1600_192n1', programs[73], [buf_55, buf_180, buf_235]);
        runProgram(gl, 'E_64_1600', programs[74], [buf_90, buf_55, buf_236, buf_237, buf_238, buf_239]);
        runProgram(gl, 'E_64_1600n1', programs[75], [buf_102, buf_55, buf_236, buf_237, buf_238, buf_239]);
        runProgram(gl, 'r_64_40_40_64_3_3', programs[76], [buf_96, buf_102, buf_240, buf_241, buf_242, buf_243, buf_244]);
        runProgram(gl, 'r_64_40_40_64_3_3', programs[77], [buf_113, buf_96, buf_245, buf_246, buf_247, buf_248, buf_249]);
        runProgram(gl, 'E_192_1600', programs[78], [buf_180, buf_90, buf_102, buf_113]);
        runProgram(gl, 'r_128_1600_192', programs[79], [buf_55, buf_180, buf_250, buf_251, buf_252, buf_253, buf_254]);
        runProgram(gl, 'r_64_40_40_128_3_3', programs[80], [buf_90, buf_55, buf_255, buf_256, buf_257, buf_258, buf_259]);
        runProgram(gl, 'r_64_40_40_64_3_3', programs[81], [buf_102, buf_90, buf_260, buf_261, buf_262, buf_263, buf_264]);
        runProgram(gl, 'r_64_1600_64', programs[82], [buf_90, buf_102, buf_265]);
        runProgram(gl, 'r_80_40_40_128_3_3', programs[83], [buf_266, buf_55, buf_267, buf_268, buf_269, buf_270, buf_271]);
        runProgram(gl, 'r_80_40_40_80_3_3', programs[84], [buf_272, buf_266, buf_273, buf_274, buf_275, buf_276, buf_277]);
        runProgram(gl, 'r_80_1600_80', programs[85], [buf_266, buf_272, buf_278]);
        runProgram(gl, 'r_128_20_20_128_3_3n2', programs[86], [buf_130, buf_55, buf_279, buf_280, buf_281, buf_282, buf_283]);
        runProgram(gl, 'E_384_400n1', programs[87], [buf_148, buf_130, buf_95]);
        runProgram(gl, 'r_256_400_384n1', programs[88], [buf_95, buf_148, buf_284]);
        runProgram(gl, 'E_128_400', programs[89], [buf_130, buf_95, buf_285, buf_286, buf_287, buf_288]);
        runProgram(gl, 'E_128_400n1', programs[90], [buf_135, buf_95, buf_285, buf_286, buf_287, buf_288]);
        runProgram(gl, 'r_128_20_20_128_3_3', programs[91], [buf_142, buf_135, buf_289, buf_290, buf_291, buf_292, buf_293]);
        runProgram(gl, 'r_128_20_20_128_3_3', programs[92], [buf_136, buf_142, buf_294, buf_295, buf_296, buf_297, buf_298]);
        runProgram(gl, 'E_384_400', programs[93], [buf_148, buf_130, buf_135, buf_136]);
        runProgram(gl, 'r_256_400_384', programs[94], [buf_95, buf_148, buf_299, buf_300, buf_301, buf_302, buf_303]);
        runProgram(gl, 'r_64_20_20_256_3_3', programs[95], [buf_304, buf_95, buf_305, buf_306, buf_307, buf_308, buf_309]);
        runProgram(gl, 'r_64_20_20_64_3_3', programs[96], [buf_310, buf_304, buf_311, buf_312, buf_313, buf_314, buf_315]);
        runProgram(gl, 'r_64_400_64', programs[97], [buf_304, buf_310, buf_316]);
        runProgram(gl, 'r_80_20_20_256_3_3', programs[98], [buf_317, buf_95, buf_318, buf_319, buf_320, buf_321, buf_322]);
        runProgram(gl, 'r_80_20_20_80_3_3', programs[99], [buf_323, buf_317, buf_324, buf_325, buf_326, buf_327, buf_328]);
        runProgram(gl, 'r_80_400_80', programs[100], [buf_317, buf_323, buf_329]);
        runProgram(gl, 'E_16_4_8400', programs[101], [buf_330, buf_20, buf_331, buf_217, buf_332, buf_90, buf_333, buf_266, buf_334, buf_304, buf_335, buf_317, buf_336]);
        runProgram(gl, 'r_33600_16', programs[102], [buf_337, buf_330]);
        runProgram(gl, 'E_16_33600', programs[103], [buf_338, buf_330, buf_337]);
        runProgram(gl, 'r_33600_16n1', programs[104], [buf_337, buf_338]);
        runProgram(gl, 'r_33600_16n2', programs[105], [buf_339, buf_338, buf_337, buf_340]);
        runProgram(gl, 'E_8400', programs[106], [buf_341]);
        runProgram(gl, 'E_80_8400', programs[107], [buf_342, buf_20, buf_331, buf_217, buf_332, buf_90, buf_333, buf_266, buf_334, buf_304, buf_335, buf_317, buf_336]);
        runProgram(gl, 'E_84_8400', programs[108], [output0, buf_0, buf_1, buf_2, buf_3, buf_4, buf_5, buf_339, buf_341, buf_342]);

      return readTextureData(gl, output0);
    }
  }