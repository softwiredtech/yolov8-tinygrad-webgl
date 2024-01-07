
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
      gl.uniform1i(gl.getUniformLocation(program, "width"), textures[0].width);  

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
  
const r_80_20_4 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;

out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 80 */
  int acc0 = int((0));
  for (int ridx0 = int((0)); ridx0 < int((20)); ridx0++) {
    int alu0 = ((idx0*(int((-1))))+(ridx0*(int((-4)))));
    acc0 = ((float((float(alu0)<float((int((-75))))))!=0.0?int((1.0)):int((0)))+((float((float(alu0)<float((int((-76))))))!=0.0?int((1.0)):int((0)))+((float((float(alu0)<float((int((-77))))))!=0.0?int((1.0)):int((0)))+((float((float(alu0)<float((int((-78))))))!=0.0?int((1.0)):int((0)))+acc0))));
  }
  out_data = float((float((acc0+(int((-1)))))+float((0.5))));
}`;

const r_40_10_4 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;

out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 40 */
  int acc0 = int((0));
  for (int ridx0 = int((0)); ridx0 < int((10)); ridx0++) {
    int alu0 = ((idx0*(int((-1))))+(ridx0*(int((-4)))));
    acc0 = ((float((float(alu0)<float((int((-35))))))!=0.0?int((1.0)):int((0)))+((float((float(alu0)<float((int((-36))))))!=0.0?int((1.0)):int((0)))+((float((float(alu0)<float((int((-37))))))!=0.0?int((1.0)):int((0)))+((float((float(alu0)<float((int((-38))))))!=0.0?int((1.0)):int((0)))+acc0))));
  }
  out_data = float((float((acc0+(int((-1)))))+float((0.5))));
}`;

const r_20_20 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;

out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 20 */
  int acc0 = int((0));
  int alu0 = (idx0*(int((-1))));
  out_data = float((float((int((1.0))+((float((float(alu0)<float(int((0)))))!=0.0?int((1.0)):int((0)))+((float((float(alu0)<float((int((-1))))))!=0.0?int((1.0)):int((0)))+((float((float(alu0)<float((int((-2))))))!=0.0?int((1.0)):int((0)))+((float((float(alu0)<float((int((-3))))))!=0.0?int((1.0)):int((0)))+((float((float(alu0)<float((int((-4))))))!=0.0?int((1.0)):int((0)))+((float((float(alu0)<float((int((-5))))))!=0.0?int((1.0)):int((0)))+((float((float(alu0)<float((int((-6))))))!=0.0?int((1.0)):int((0)))+((float((float(alu0)<float((int((-7))))))!=0.0?int((1.0)):int((0)))+((float((float(alu0)<float((int((-8))))))!=0.0?int((1.0)):int((0)))+((float((float(alu0)<float((int((-9))))))!=0.0?int((1.0)):int((0)))+((float((float(alu0)<float((int((-10))))))!=0.0?int((1.0)):int((0)))+((float((float(alu0)<float((int((-11))))))!=0.0?int((1.0)):int((0)))+((float((float(alu0)<float((int((-12))))))!=0.0?int((1.0)):int((0)))+((float((float(alu0)<float((int((-13))))))!=0.0?int((1.0)):int((0)))+((float((float(alu0)<float((int((-14))))))!=0.0?int((1.0)):int((0)))+((float((float(alu0)<float((int((-15))))))!=0.0?int((1.0)):int((0)))+((float((float(alu0)<float((int((-16))))))!=0.0?int((1.0)):int((0)))+((float((float(alu0)<float((int((-17))))))!=0.0?int((1.0)):int((0)))+((float((float(alu0)<float((int((-18))))))!=0.0?int((1.0)):int((0)))+acc0)))))))))))))))))))+(int((-1)))))+float((0.5))));
}`;

const E_432 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 432 */
  float val0 = float(texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  out_data = float(float(val0));
}`;

const E_16 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 16 */
  float val0 = float(texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  out_data = float(float(val0));
}`;

const r_1638400_3_3_3 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 1638400 */
  float acc0 = float((0.0));
  int alu0 = (int(idx0)%int(int((320))));
  int alu1 = (int((idx0/int((320))))%int(int((320))));
  bool alu2 = (float((alu0*(int((-1)))))<float(int((0))));
  bool alu3 = (float((alu1*(int((-1)))))<float(int((0))));
  int alu4 = (idx0/int((102400)));
  float val0 = float(texture(data3, vec2(float(float(int(alu4)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu4)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val1 = float(texture(data4, vec2(float(float(int(alu4)%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu4)/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val2 = float(texture(data5, vec2(float(float(int(alu4)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu4)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val3 = float(texture(data6, vec2(float(float(int(alu4)%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu4)/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  for (int ridx0 = int((0)); ridx0 < int((3)); ridx0++) {
    int alu5 = ((alu0*int((2)))+(alu1*int((1280)))+(ridx0*int((409600))));
    float val4 = (float(bool(int(alu2)*int(alu3)))!=0.0?float(texture(data1, vec2(float(float(int(alu5+(int((-641))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5+(int((-641))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val5 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu5+(int((-640))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5+(int((-640))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val6 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu5+(int((-639))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5+(int((-639))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val7 = (float(alu2)!=0.0?float(texture(data1, vec2(float(float(int(alu5+(int((-1))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5+(int((-1))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val8 = float(texture(data1, vec2(float(float(int(alu5)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val9 = float(texture(data1, vec2(float(float(int(alu5+int((1)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5+int((1)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val10 = (float(alu2)!=0.0?float(texture(data1, vec2(float(float(int(alu5+int((639)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5+int((639)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val11 = float(texture(data1, vec2(float(float(int(alu5+int((640)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5+int((640)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val12 = float(texture(data1, vec2(float(float(int(alu5+int((641)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5+int((641)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    int alu6 = ((ridx0*int((9)))+(alu4*int((27))));
    float val13 = float(texture(data2, vec2(float(float(int(alu6)%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6)/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val14 = float(texture(data2, vec2(float(float(int(alu6+int((1)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6+int((1)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val15 = float(texture(data2, vec2(float(float(int(alu6+int((2)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6+int((2)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val16 = float(texture(data2, vec2(float(float(int(alu6+int((3)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6+int((3)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val17 = float(texture(data2, vec2(float(float(int(alu6+int((4)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6+int((4)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val18 = float(texture(data2, vec2(float(float(int(alu6+int((5)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6+int((5)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val19 = float(texture(data2, vec2(float(float(int(alu6+int((6)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6+int((6)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val20 = float(texture(data2, vec2(float(float(int(alu6+int((7)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6+int((7)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val21 = float(texture(data2, vec2(float(float(int(alu6+int((8)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6+int((8)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val12*val21)+((val11*val20)+((val10*val19)+((val9*val18)+((val8*val17)+((val7*val16)+((val6*val15)+((val5*val14)+((val4*val13)+acc0)))))))));
  }
  float alu7 = (((acc0-val0)*val1*float(sqrt((float((1.0))/(val2+float((0.001)))))))+val3);
  out_data = float((alu7*(float((1.0))/(float((1.0))+exp2((alu7*(float((-1.4426950408889634)))))))));
}`;

const E_4608 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 4608 */
  float val0 = float(texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  out_data = float(float(val0));
}`;

const E_32 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 32 */
  float val0 = float(texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  out_data = float(float(val0));
}`;

const r_819200_16_3_3 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 819200 */
  float acc0 = float((0.0));
  int alu0 = (int(idx0)%int(int((160))));
  int alu1 = (int((idx0/int((160))))%int(int((160))));
  bool alu2 = (float((alu0*(int((-1)))))<float(int((0))));
  bool alu3 = (float((alu1*(int((-1)))))<float(int((0))));
  int alu4 = (idx0/int((25600)));
  float val0 = float(texture(data3, vec2(float(float(int(alu4)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu4)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val1 = float(texture(data4, vec2(float(float(int(alu4)%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu4)/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val2 = float(texture(data5, vec2(float(float(int(alu4)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu4)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val3 = float(texture(data6, vec2(float(float(int(alu4)%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu4)/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  for (int ridx0 = int((0)); ridx0 < int((16)); ridx0++) {
    int alu5 = ((alu0*int((2)))+(alu1*int((640)))+(ridx0*int((102400))));
    float val4 = (float(bool(int(alu2)*int(alu3)))!=0.0?float(texture(data1, vec2(float(float(int(alu5+(int((-321))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5+(int((-321))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val5 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu5+(int((-320))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5+(int((-320))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val6 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu5+(int((-319))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5+(int((-319))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val7 = (float(alu2)!=0.0?float(texture(data1, vec2(float(float(int(alu5+(int((-1))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5+(int((-1))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val8 = float(texture(data1, vec2(float(float(int(alu5)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val9 = float(texture(data1, vec2(float(float(int(alu5+int((1)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5+int((1)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val10 = (float(alu2)!=0.0?float(texture(data1, vec2(float(float(int(alu5+int((319)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5+int((319)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val11 = float(texture(data1, vec2(float(float(int(alu5+int((320)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5+int((320)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val12 = float(texture(data1, vec2(float(float(int(alu5+int((321)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5+int((321)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    int alu6 = ((ridx0*int((9)))+(alu4*int((144))));
    float val13 = float(texture(data2, vec2(float(float(int(alu6)%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6)/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val14 = float(texture(data2, vec2(float(float(int(alu6+int((1)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6+int((1)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val15 = float(texture(data2, vec2(float(float(int(alu6+int((2)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6+int((2)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val16 = float(texture(data2, vec2(float(float(int(alu6+int((3)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6+int((3)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val17 = float(texture(data2, vec2(float(float(int(alu6+int((4)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6+int((4)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val18 = float(texture(data2, vec2(float(float(int(alu6+int((5)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6+int((5)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val19 = float(texture(data2, vec2(float(float(int(alu6+int((6)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6+int((6)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val20 = float(texture(data2, vec2(float(float(int(alu6+int((7)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6+int((7)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val21 = float(texture(data2, vec2(float(float(int(alu6+int((8)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6+int((8)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val12*val21)+((val11*val20)+((val10*val19)+((val9*val18)+((val8*val17)+((val7*val16)+((val6*val15)+((val5*val14)+((val4*val13)+acc0)))))))));
  }
  float alu7 = (((acc0-val0)*val1*float(sqrt((float((1.0))/(val2+float((0.001)))))))+val3);
  out_data = float((alu7*(float((1.0))/(float((1.0))+exp2((alu7*(float((-1.4426950408889634)))))))));
}`;

const E_1024 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 1024 */
  float val0 = float(texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  out_data = float(float(val0));
}`;

const r_819200_32 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 819200 */
  float acc0 = float((0.0));
  int alu0 = (int(idx0)%int(int((25600))));
  float val0 = float(texture(data1, vec2(float(float(int(alu0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  float val1 = float(texture(data1, vec2(float(float(int(alu0+int((25600)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu0+int((25600)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  float val2 = float(texture(data1, vec2(float(float(int(alu0+int((51200)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu0+int((51200)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  float val3 = float(texture(data1, vec2(float(float(int(alu0+int((76800)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu0+int((76800)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  float val4 = float(texture(data1, vec2(float(float(int(alu0+int((102400)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu0+int((102400)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  float val5 = float(texture(data1, vec2(float(float(int(alu0+int((128000)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu0+int((128000)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  float val6 = float(texture(data1, vec2(float(float(int(alu0+int((153600)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu0+int((153600)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  float val7 = float(texture(data1, vec2(float(float(int(alu0+int((179200)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu0+int((179200)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  float val8 = float(texture(data1, vec2(float(float(int(alu0+int((204800)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu0+int((204800)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  float val9 = float(texture(data1, vec2(float(float(int(alu0+int((230400)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu0+int((230400)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  float val10 = float(texture(data1, vec2(float(float(int(alu0+int((256000)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu0+int((256000)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  float val11 = float(texture(data1, vec2(float(float(int(alu0+int((281600)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu0+int((281600)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  float val12 = float(texture(data1, vec2(float(float(int(alu0+int((307200)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu0+int((307200)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  float val13 = float(texture(data1, vec2(float(float(int(alu0+int((332800)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu0+int((332800)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  float val14 = float(texture(data1, vec2(float(float(int(alu0+int((358400)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu0+int((358400)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  float val15 = float(texture(data1, vec2(float(float(int(alu0+int((384000)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu0+int((384000)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  float val16 = float(texture(data1, vec2(float(float(int(alu0+int((409600)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu0+int((409600)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  float val17 = float(texture(data1, vec2(float(float(int(alu0+int((435200)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu0+int((435200)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  float val18 = float(texture(data1, vec2(float(float(int(alu0+int((460800)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu0+int((460800)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  float val19 = float(texture(data1, vec2(float(float(int(alu0+int((486400)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu0+int((486400)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  float val20 = float(texture(data1, vec2(float(float(int(alu0+int((512000)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu0+int((512000)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  float val21 = float(texture(data1, vec2(float(float(int(alu0+int((537600)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu0+int((537600)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  float val22 = float(texture(data1, vec2(float(float(int(alu0+int((563200)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu0+int((563200)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  float val23 = float(texture(data1, vec2(float(float(int(alu0+int((588800)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu0+int((588800)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  float val24 = float(texture(data1, vec2(float(float(int(alu0+int((614400)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu0+int((614400)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  float val25 = float(texture(data1, vec2(float(float(int(alu0+int((640000)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu0+int((640000)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  float val26 = float(texture(data1, vec2(float(float(int(alu0+int((665600)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu0+int((665600)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  float val27 = float(texture(data1, vec2(float(float(int(alu0+int((691200)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu0+int((691200)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  float val28 = float(texture(data1, vec2(float(float(int(alu0+int((716800)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu0+int((716800)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  float val29 = float(texture(data1, vec2(float(float(int(alu0+int((742400)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu0+int((742400)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  float val30 = float(texture(data1, vec2(float(float(int(alu0+int((768000)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu0+int((768000)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  float val31 = float(texture(data1, vec2(float(float(int(alu0+int((793600)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu0+int((793600)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  int alu1 = (idx0/int((25600)));
  int alu2 = (alu1*int((32)));
  float val32 = float(texture(data2, vec2(float(float(int(alu2)%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2)/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
  float val33 = float(texture(data2, vec2(float(float(int(alu2+int((1)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((1)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
  float val34 = float(texture(data2, vec2(float(float(int(alu2+int((2)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((2)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
  float val35 = float(texture(data2, vec2(float(float(int(alu2+int((3)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((3)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
  float val36 = float(texture(data2, vec2(float(float(int(alu2+int((4)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((4)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
  float val37 = float(texture(data2, vec2(float(float(int(alu2+int((5)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((5)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
  float val38 = float(texture(data2, vec2(float(float(int(alu2+int((6)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((6)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
  float val39 = float(texture(data2, vec2(float(float(int(alu2+int((7)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((7)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
  float val40 = float(texture(data2, vec2(float(float(int(alu2+int((8)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((8)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
  float val41 = float(texture(data2, vec2(float(float(int(alu2+int((9)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((9)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
  float val42 = float(texture(data2, vec2(float(float(int(alu2+int((10)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((10)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
  float val43 = float(texture(data2, vec2(float(float(int(alu2+int((11)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((11)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
  float val44 = float(texture(data2, vec2(float(float(int(alu2+int((12)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((12)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
  float val45 = float(texture(data2, vec2(float(float(int(alu2+int((13)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((13)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
  float val46 = float(texture(data2, vec2(float(float(int(alu2+int((14)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((14)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
  float val47 = float(texture(data2, vec2(float(float(int(alu2+int((15)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((15)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
  float val48 = float(texture(data2, vec2(float(float(int(alu2+int((16)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((16)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
  float val49 = float(texture(data2, vec2(float(float(int(alu2+int((17)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((17)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
  float val50 = float(texture(data2, vec2(float(float(int(alu2+int((18)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((18)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
  float val51 = float(texture(data2, vec2(float(float(int(alu2+int((19)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((19)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
  float val52 = float(texture(data2, vec2(float(float(int(alu2+int((20)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((20)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
  float val53 = float(texture(data2, vec2(float(float(int(alu2+int((21)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((21)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
  float val54 = float(texture(data2, vec2(float(float(int(alu2+int((22)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((22)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
  float val55 = float(texture(data2, vec2(float(float(int(alu2+int((23)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((23)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
  float val56 = float(texture(data2, vec2(float(float(int(alu2+int((24)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((24)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
  float val57 = float(texture(data2, vec2(float(float(int(alu2+int((25)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((25)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
  float val58 = float(texture(data2, vec2(float(float(int(alu2+int((26)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((26)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
  float val59 = float(texture(data2, vec2(float(float(int(alu2+int((27)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((27)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
  float val60 = float(texture(data2, vec2(float(float(int(alu2+int((28)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((28)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
  float val61 = float(texture(data2, vec2(float(float(int(alu2+int((29)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((29)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
  float val62 = float(texture(data2, vec2(float(float(int(alu2+int((30)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((30)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
  float val63 = float(texture(data2, vec2(float(float(int(alu2+int((31)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((31)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
  float val64 = float(texture(data3, vec2(float(float(int(alu1)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu1)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val65 = float(texture(data4, vec2(float(float(int(alu1)%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu1)/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val66 = float(texture(data5, vec2(float(float(int(alu1)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu1)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val67 = float(texture(data6, vec2(float(float(int(alu1)%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu1)/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  float alu3 = (((((val31*val63)+((val30*val62)+((val29*val61)+((val28*val60)+((val27*val59)+((val26*val58)+((val25*val57)+((val24*val56)+((val23*val55)+((val22*val54)+((val21*val53)+((val20*val52)+((val19*val51)+((val18*val50)+((val17*val49)+((val16*val48)+((val15*val47)+((val14*val46)+((val13*val45)+((val12*val44)+((val11*val43)+((val10*val42)+((val9*val41)+((val8*val40)+((val7*val39)+((val6*val38)+((val5*val37)+((val4*val36)+((val3*val35)+((val2*val34)+((val1*val33)+((val0*val32)+acc0))))))))))))))))))))))))))))))))-val64)*val65*float(sqrt((float((1.0))/(val66+float((0.001)))))))+val67);
  out_data = float((alu3*(float((1.0))/(float((1.0))+exp2((alu3*(float((-1.4426950408889634)))))))));
}`;

const E_2304 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 2304 */
  float val0 = float(texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  out_data = float(float(val0));
}`;

const r_409600_16_3_3 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 409600 */
  float acc0 = float((0.0));
  int alu0 = (int(idx0)%int(int((160))));
  int alu1 = (int((idx0/int((160))))%int(int((160))));
  bool alu2 = (float((alu0*(int((-1)))))<float(int((0))));
  bool alu3 = (float((alu1*(int((-1)))))<float(int((0))));
  bool alu4 = (float(alu0)<float(int((159))));
  bool alu5 = (float(alu1)<float(int((159))));
  int alu6 = (idx0/int((25600)));
  float val0 = float(texture(data3, vec2(float(float(int(alu6)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu6)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val1 = float(texture(data4, vec2(float(float(int(alu6)%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu6)/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val2 = float(texture(data5, vec2(float(float(int(alu6)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu6)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val3 = float(texture(data6, vec2(float(float(int(alu6)%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu6)/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  for (int ridx0 = int((0)); ridx0 < int((16)); ridx0++) {
    int alu7 = (alu0+(alu1*int((160)))+(ridx0*int((25600))));
    float val4 = (float(bool(int(alu2)*int(alu3)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((409439)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((409439)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val5 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((409440)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((409440)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val6 = (float(bool(int(alu4)*int(alu3)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((409441)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((409441)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val7 = (float(alu2)!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((409599)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((409599)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val8 = float(texture(data1, vec2(float(float(int(alu7+int((409600)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((409600)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val9 = (float(alu4)!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((409601)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((409601)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val10 = (float(bool(int(alu2)*int(alu5)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((409759)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((409759)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val11 = (float(alu5)!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((409760)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((409760)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val12 = (float(bool(int(alu4)*int(alu5)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((409761)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((409761)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    int alu8 = ((ridx0*int((9)))+(alu6*int((144))));
    float val13 = float(texture(data2, vec2(float(float(int(alu8)%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8)/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val14 = float(texture(data2, vec2(float(float(int(alu8+int((1)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((1)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val15 = float(texture(data2, vec2(float(float(int(alu8+int((2)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((2)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val16 = float(texture(data2, vec2(float(float(int(alu8+int((3)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((3)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val17 = float(texture(data2, vec2(float(float(int(alu8+int((4)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((4)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val18 = float(texture(data2, vec2(float(float(int(alu8+int((5)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((5)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val19 = float(texture(data2, vec2(float(float(int(alu8+int((6)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((6)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val20 = float(texture(data2, vec2(float(float(int(alu8+int((7)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((7)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val21 = float(texture(data2, vec2(float(float(int(alu8+int((8)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((8)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val12*val21)+((val11*val20)+((val10*val19)+((val9*val18)+((val8*val17)+((val7*val16)+((val6*val15)+((val5*val14)+((val4*val13)+acc0)))))))));
  }
  float alu9 = (((acc0-val0)*val1*float(sqrt((float((1.0))/(val2+float((0.001)))))))+val3);
  out_data = float((alu9*(float((1.0))/(float((1.0))+exp2((alu9*(float((-1.4426950408889634)))))))));
}`;

const r_409600_16_3_3n1 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
uniform sampler2D data7;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 409600 */
  float acc0 = float((0.0));
  int alu0 = (int(idx0)%int(int((160))));
  int alu1 = (int((idx0/int((160))))%int(int((160))));
  bool alu2 = (float((alu0*(int((-1)))))<float(int((0))));
  bool alu3 = (float((alu1*(int((-1)))))<float(int((0))));
  bool alu4 = (float(alu0)<float(int((159))));
  bool alu5 = (float(alu1)<float(int((159))));
  int alu6 = (idx0/int((25600)));
  float val0 = float(texture(data1, vec2(float(float(int(idx0+int((409600)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0+int((409600)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  float val1 = float(texture(data4, vec2(float(float(int(alu6)%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu6)/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val2 = float(texture(data5, vec2(float(float(int(alu6)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu6)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val3 = float(texture(data6, vec2(float(float(int(alu6)%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu6)/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  float val4 = float(texture(data7, vec2(float(float(int(alu6)%textureSize(data7, 0).x) + 0.5f)/float(textureSize(data7, 0).x), float(float(int(alu6)/textureSize(data7, 0).x) + 0.5f)/float(textureSize(data7, 0).y))).r);
  for (int ridx0 = int((0)); ridx0 < int((16)); ridx0++) {
    int alu7 = (alu0+(alu1*int((160)))+(ridx0*int((25600))));
    float val5 = (float(bool(int(alu2)*int(alu3)))!=0.0?float(texture(data2, vec2(float(float(int(alu7+(int((-161))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu7+(int((-161))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
    float val6 = (float(alu3)!=0.0?float(texture(data2, vec2(float(float(int(alu7+(int((-160))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu7+(int((-160))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
    float val7 = (float(bool(int(alu4)*int(alu3)))!=0.0?float(texture(data2, vec2(float(float(int(alu7+(int((-159))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu7+(int((-159))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
    float val8 = (float(alu2)!=0.0?float(texture(data2, vec2(float(float(int(alu7+(int((-1))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu7+(int((-1))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
    float val9 = float(texture(data2, vec2(float(float(int(alu7)%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu7)/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val10 = (float(alu4)!=0.0?float(texture(data2, vec2(float(float(int(alu7+int((1)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu7+int((1)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
    float val11 = (float(bool(int(alu2)*int(alu5)))!=0.0?float(texture(data2, vec2(float(float(int(alu7+int((159)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu7+int((159)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
    float val12 = (float(alu5)!=0.0?float(texture(data2, vec2(float(float(int(alu7+int((160)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu7+int((160)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
    float val13 = (float(bool(int(alu4)*int(alu5)))!=0.0?float(texture(data2, vec2(float(float(int(alu7+int((161)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu7+int((161)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
    int alu8 = ((ridx0*int((9)))+(alu6*int((144))));
    float val14 = float(texture(data3, vec2(float(float(int(alu8)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu8)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
    float val15 = float(texture(data3, vec2(float(float(int(alu8+int((1)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu8+int((1)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
    float val16 = float(texture(data3, vec2(float(float(int(alu8+int((2)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu8+int((2)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
    float val17 = float(texture(data3, vec2(float(float(int(alu8+int((3)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu8+int((3)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
    float val18 = float(texture(data3, vec2(float(float(int(alu8+int((4)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu8+int((4)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
    float val19 = float(texture(data3, vec2(float(float(int(alu8+int((5)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu8+int((5)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
    float val20 = float(texture(data3, vec2(float(float(int(alu8+int((6)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu8+int((6)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
    float val21 = float(texture(data3, vec2(float(float(int(alu8+int((7)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu8+int((7)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
    float val22 = float(texture(data3, vec2(float(float(int(alu8+int((8)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu8+int((8)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
    acc0 = ((val13*val22)+((val12*val21)+((val11*val20)+((val10*val19)+((val9*val18)+((val8*val17)+((val7*val16)+((val6*val15)+((val5*val14)+acc0)))))))));
  }
  float alu9 = (((acc0-val1)*val2*float(sqrt((float((1.0))/(val3+float((0.001)))))))+val4);
  out_data = float((val0+(alu9*(float((1.0))/(float((1.0))+exp2((alu9*(float((-1.4426950408889634))))))))));
}`;

const E_1228800n1 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 1228800 */
  int alu0 = (int(idx0)%int(int((819200))));
  bool alu1 = (float(idx0)<float(int((819200))));
  int alu2 = (int((idx0/int((25600))))%int(int((32))));
  float val0 = (float(bool(int(alu1)*int((float(alu2)<float(int((16)))))))!=0.0?float(texture(data1, vec2(float(float(int(alu0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val1 = (float(bool(int(alu1)*int((float((alu2*(int((-1)))))<float((int((-15))))))))!=0.0?float(texture(data1, vec2(float(float(int(alu0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val2 = (float((float((idx0*(int((-1)))))<float((int((-819199))))))!=0.0?float(texture(data2, vec2(float(float(int(idx0+(int((-819200))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(idx0+(int((-819200))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
  out_data = float((val0+val1+val2));
}`;

const E_1536 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 1536 */
  float val0 = float(texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  out_data = float(float(val0));
}`;

const r_819200_12_4 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 819200 */
  float acc0 = float((0.0));
  int alu0 = (idx0/int((25600)));
  float val0 = float(texture(data3, vec2(float(float(int(alu0)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu0)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val1 = float(texture(data4, vec2(float(float(int(alu0)%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu0)/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val2 = float(texture(data5, vec2(float(float(int(alu0)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu0)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val3 = float(texture(data6, vec2(float(float(int(alu0)%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu0)/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  for (int ridx0 = int((0)); ridx0 < int((12)); ridx0++) {
    int alu1 = ((ridx0*int((102400)))+(int(idx0)%int(int((25600)))));
    float val4 = float(texture(data1, vec2(float(float(int(alu1)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val5 = float(texture(data1, vec2(float(float(int(alu1+int((25600)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1+int((25600)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val6 = float(texture(data1, vec2(float(float(int(alu1+int((51200)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1+int((51200)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val7 = float(texture(data1, vec2(float(float(int(alu1+int((76800)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1+int((76800)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    int alu2 = ((ridx0*int((4)))+(alu0*int((48))));
    float val8 = float(texture(data2, vec2(float(float(int(alu2)%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2)/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val9 = float(texture(data2, vec2(float(float(int(alu2+int((1)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((1)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val10 = float(texture(data2, vec2(float(float(int(alu2+int((2)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((2)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val11 = float(texture(data2, vec2(float(float(int(alu2+int((3)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((3)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val7*val11)+((val6*val10)+((val5*val9)+((val4*val8)+acc0))));
  }
  float alu3 = (((acc0-val0)*val1*float(sqrt((float((1.0))/(val2+float((0.001)))))))+val3);
  out_data = float((alu3*(float((1.0))/(float((1.0))+exp2((alu3*(float((-1.4426950408889634)))))))));
}`;

const E_18432 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 18432 */
  float val0 = float(texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  out_data = float(float(val0));
}`;

const E_64 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 64 */
  float val0 = float(texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  out_data = float(float(val0));
}`;

const r_409600_32_3_3 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 409600 */
  float acc0 = float((0.0));
  int alu0 = (int(idx0)%int(int((80))));
  int alu1 = (int((idx0/int((80))))%int(int((80))));
  bool alu2 = (float((alu0*(int((-1)))))<float(int((0))));
  bool alu3 = (float((alu1*(int((-1)))))<float(int((0))));
  int alu4 = (idx0/int((6400)));
  float val0 = float(texture(data3, vec2(float(float(int(alu4)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu4)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val1 = float(texture(data4, vec2(float(float(int(alu4)%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu4)/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val2 = float(texture(data5, vec2(float(float(int(alu4)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu4)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val3 = float(texture(data6, vec2(float(float(int(alu4)%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu4)/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  for (int ridx0 = int((0)); ridx0 < int((32)); ridx0++) {
    int alu5 = ((alu0*int((2)))+(alu1*int((320)))+(ridx0*int((25600))));
    float val4 = (float(bool(int(alu2)*int(alu3)))!=0.0?float(texture(data1, vec2(float(float(int(alu5+(int((-161))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5+(int((-161))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val5 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu5+(int((-160))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5+(int((-160))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val6 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu5+(int((-159))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5+(int((-159))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val7 = (float(alu2)!=0.0?float(texture(data1, vec2(float(float(int(alu5+(int((-1))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5+(int((-1))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val8 = float(texture(data1, vec2(float(float(int(alu5)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val9 = float(texture(data1, vec2(float(float(int(alu5+int((1)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5+int((1)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val10 = (float(alu2)!=0.0?float(texture(data1, vec2(float(float(int(alu5+int((159)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5+int((159)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val11 = float(texture(data1, vec2(float(float(int(alu5+int((160)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5+int((160)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val12 = float(texture(data1, vec2(float(float(int(alu5+int((161)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5+int((161)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    int alu6 = ((ridx0*int((9)))+(alu4*int((288))));
    float val13 = float(texture(data2, vec2(float(float(int(alu6)%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6)/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val14 = float(texture(data2, vec2(float(float(int(alu6+int((1)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6+int((1)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val15 = float(texture(data2, vec2(float(float(int(alu6+int((2)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6+int((2)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val16 = float(texture(data2, vec2(float(float(int(alu6+int((3)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6+int((3)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val17 = float(texture(data2, vec2(float(float(int(alu6+int((4)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6+int((4)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val18 = float(texture(data2, vec2(float(float(int(alu6+int((5)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6+int((5)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val19 = float(texture(data2, vec2(float(float(int(alu6+int((6)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6+int((6)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val20 = float(texture(data2, vec2(float(float(int(alu6+int((7)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6+int((7)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val21 = float(texture(data2, vec2(float(float(int(alu6+int((8)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6+int((8)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val12*val21)+((val11*val20)+((val10*val19)+((val9*val18)+((val8*val17)+((val7*val16)+((val6*val15)+((val5*val14)+((val4*val13)+acc0)))))))));
  }
  float alu7 = (((acc0-val0)*val1*float(sqrt((float((1.0))/(val2+float((0.001)))))))+val3);
  out_data = float((alu7*(float((1.0))/(float((1.0))+exp2((alu7*(float((-1.4426950408889634)))))))));
}`;

const E_4096 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 4096 */
  float val0 = float(texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  out_data = float(float(val0));
}`;

const r_409600_16_4 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 409600 */
  float acc0 = float((0.0));
  int alu0 = (idx0/int((6400)));
  float val0 = float(texture(data3, vec2(float(float(int(alu0)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu0)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val1 = float(texture(data4, vec2(float(float(int(alu0)%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu0)/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val2 = float(texture(data5, vec2(float(float(int(alu0)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu0)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val3 = float(texture(data6, vec2(float(float(int(alu0)%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu0)/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  for (int ridx0 = int((0)); ridx0 < int((16)); ridx0++) {
    int alu1 = ((ridx0*int((25600)))+(int(idx0)%int(int((6400)))));
    float val4 = float(texture(data1, vec2(float(float(int(alu1)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val5 = float(texture(data1, vec2(float(float(int(alu1+int((6400)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1+int((6400)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val6 = float(texture(data1, vec2(float(float(int(alu1+int((12800)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1+int((12800)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val7 = float(texture(data1, vec2(float(float(int(alu1+int((19200)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1+int((19200)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    int alu2 = ((ridx0*int((4)))+(alu0*int((64))));
    float val8 = float(texture(data2, vec2(float(float(int(alu2)%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2)/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val9 = float(texture(data2, vec2(float(float(int(alu2+int((1)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((1)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val10 = float(texture(data2, vec2(float(float(int(alu2+int((2)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((2)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val11 = float(texture(data2, vec2(float(float(int(alu2+int((3)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((3)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val7*val11)+((val6*val10)+((val5*val9)+((val4*val8)+acc0))));
  }
  float alu3 = (((acc0-val0)*val1*float(sqrt((float((1.0))/(val2+float((0.001)))))))+val3);
  out_data = float((alu3*(float((1.0))/(float((1.0))+exp2((alu3*(float((-1.4426950408889634)))))))));
}`;

const E_9216 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 9216 */
  float val0 = float(texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  out_data = float(float(val0));
}`;

const r_204800_32_3_3 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 204800 */
  float acc0 = float((0.0));
  int alu0 = (int(idx0)%int(int((80))));
  int alu1 = (int((idx0/int((80))))%int(int((80))));
  bool alu2 = (float((alu0*(int((-1)))))<float(int((0))));
  bool alu3 = (float((alu1*(int((-1)))))<float(int((0))));
  bool alu4 = (float(alu0)<float(int((79))));
  bool alu5 = (float(alu1)<float(int((79))));
  int alu6 = (idx0/int((6400)));
  float val0 = float(texture(data3, vec2(float(float(int(alu6)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu6)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val1 = float(texture(data4, vec2(float(float(int(alu6)%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu6)/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val2 = float(texture(data5, vec2(float(float(int(alu6)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu6)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val3 = float(texture(data6, vec2(float(float(int(alu6)%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu6)/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  for (int ridx0 = int((0)); ridx0 < int((32)); ridx0++) {
    int alu7 = (alu0+(alu1*int((80)))+(ridx0*int((6400))));
    float val4 = (float(bool(int(alu2)*int(alu3)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((204719)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((204719)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val5 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((204720)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((204720)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val6 = (float(bool(int(alu4)*int(alu3)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((204721)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((204721)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val7 = (float(alu2)!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((204799)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((204799)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val8 = float(texture(data1, vec2(float(float(int(alu7+int((204800)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((204800)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val9 = (float(alu4)!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((204801)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((204801)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val10 = (float(bool(int(alu2)*int(alu5)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((204879)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((204879)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val11 = (float(alu5)!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((204880)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((204880)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val12 = (float(bool(int(alu4)*int(alu5)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((204881)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((204881)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    int alu8 = ((ridx0*int((9)))+(alu6*int((288))));
    float val13 = float(texture(data2, vec2(float(float(int(alu8)%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8)/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val14 = float(texture(data2, vec2(float(float(int(alu8+int((1)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((1)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val15 = float(texture(data2, vec2(float(float(int(alu8+int((2)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((2)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val16 = float(texture(data2, vec2(float(float(int(alu8+int((3)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((3)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val17 = float(texture(data2, vec2(float(float(int(alu8+int((4)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((4)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val18 = float(texture(data2, vec2(float(float(int(alu8+int((5)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((5)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val19 = float(texture(data2, vec2(float(float(int(alu8+int((6)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((6)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val20 = float(texture(data2, vec2(float(float(int(alu8+int((7)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((7)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val21 = float(texture(data2, vec2(float(float(int(alu8+int((8)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((8)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val12*val21)+((val11*val20)+((val10*val19)+((val9*val18)+((val8*val17)+((val7*val16)+((val6*val15)+((val5*val14)+((val4*val13)+acc0)))))))));
  }
  float alu9 = (((acc0-val0)*val1*float(sqrt((float((1.0))/(val2+float((0.001)))))))+val3);
  out_data = float((alu9*(float((1.0))/(float((1.0))+exp2((alu9*(float((-1.4426950408889634)))))))));
}`;

const r_204800_32_3_3n1 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
uniform sampler2D data7;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 204800 */
  float acc0 = float((0.0));
  int alu0 = (int(idx0)%int(int((80))));
  int alu1 = (int((idx0/int((80))))%int(int((80))));
  bool alu2 = (float((alu0*(int((-1)))))<float(int((0))));
  bool alu3 = (float((alu1*(int((-1)))))<float(int((0))));
  bool alu4 = (float(alu0)<float(int((79))));
  bool alu5 = (float(alu1)<float(int((79))));
  int alu6 = (idx0/int((6400)));
  float val0 = float(texture(data1, vec2(float(float(int(idx0+int((204800)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0+int((204800)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  float val1 = float(texture(data4, vec2(float(float(int(alu6)%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu6)/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val2 = float(texture(data5, vec2(float(float(int(alu6)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu6)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val3 = float(texture(data6, vec2(float(float(int(alu6)%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu6)/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  float val4 = float(texture(data7, vec2(float(float(int(alu6)%textureSize(data7, 0).x) + 0.5f)/float(textureSize(data7, 0).x), float(float(int(alu6)/textureSize(data7, 0).x) + 0.5f)/float(textureSize(data7, 0).y))).r);
  for (int ridx0 = int((0)); ridx0 < int((32)); ridx0++) {
    int alu7 = (alu0+(alu1*int((80)))+(ridx0*int((6400))));
    float val5 = (float(bool(int(alu2)*int(alu3)))!=0.0?float(texture(data2, vec2(float(float(int(alu7+(int((-81))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu7+(int((-81))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
    float val6 = (float(alu3)!=0.0?float(texture(data2, vec2(float(float(int(alu7+(int((-80))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu7+(int((-80))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
    float val7 = (float(bool(int(alu4)*int(alu3)))!=0.0?float(texture(data2, vec2(float(float(int(alu7+(int((-79))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu7+(int((-79))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
    float val8 = (float(alu2)!=0.0?float(texture(data2, vec2(float(float(int(alu7+(int((-1))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu7+(int((-1))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
    float val9 = float(texture(data2, vec2(float(float(int(alu7)%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu7)/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val10 = (float(alu4)!=0.0?float(texture(data2, vec2(float(float(int(alu7+int((1)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu7+int((1)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
    float val11 = (float(bool(int(alu2)*int(alu5)))!=0.0?float(texture(data2, vec2(float(float(int(alu7+int((79)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu7+int((79)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
    float val12 = (float(alu5)!=0.0?float(texture(data2, vec2(float(float(int(alu7+int((80)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu7+int((80)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
    float val13 = (float(bool(int(alu4)*int(alu5)))!=0.0?float(texture(data2, vec2(float(float(int(alu7+int((81)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu7+int((81)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
    int alu8 = ((ridx0*int((9)))+(alu6*int((288))));
    float val14 = float(texture(data3, vec2(float(float(int(alu8)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu8)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
    float val15 = float(texture(data3, vec2(float(float(int(alu8+int((1)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu8+int((1)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
    float val16 = float(texture(data3, vec2(float(float(int(alu8+int((2)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu8+int((2)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
    float val17 = float(texture(data3, vec2(float(float(int(alu8+int((3)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu8+int((3)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
    float val18 = float(texture(data3, vec2(float(float(int(alu8+int((4)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu8+int((4)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
    float val19 = float(texture(data3, vec2(float(float(int(alu8+int((5)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu8+int((5)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
    float val20 = float(texture(data3, vec2(float(float(int(alu8+int((6)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu8+int((6)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
    float val21 = float(texture(data3, vec2(float(float(int(alu8+int((7)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu8+int((7)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
    float val22 = float(texture(data3, vec2(float(float(int(alu8+int((8)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu8+int((8)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
    acc0 = ((val13*val22)+((val12*val21)+((val11*val20)+((val10*val19)+((val9*val18)+((val8*val17)+((val7*val16)+((val6*val15)+((val5*val14)+acc0)))))))));
  }
  float alu9 = (((acc0-val1)*val2*float(sqrt((float((1.0))/(val3+float((0.001)))))))+val4);
  out_data = float((val0+(alu9*(float((1.0))/(float((1.0))+exp2((alu9*(float((-1.4426950408889634))))))))));
}`;

const r_204800_32_3_3n2 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 204800 */
  float acc0 = float((0.0));
  int alu0 = (int(idx0)%int(int((80))));
  int alu1 = (int((idx0/int((80))))%int(int((80))));
  bool alu2 = (float((alu0*(int((-1)))))<float(int((0))));
  bool alu3 = (float((alu1*(int((-1)))))<float(int((0))));
  bool alu4 = (float(alu0)<float(int((79))));
  bool alu5 = (float(alu1)<float(int((79))));
  int alu6 = (idx0/int((6400)));
  float val0 = float(texture(data3, vec2(float(float(int(alu6)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu6)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val1 = float(texture(data4, vec2(float(float(int(alu6)%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu6)/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val2 = float(texture(data5, vec2(float(float(int(alu6)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu6)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val3 = float(texture(data6, vec2(float(float(int(alu6)%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu6)/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  for (int ridx0 = int((0)); ridx0 < int((32)); ridx0++) {
    int alu7 = (alu0+(alu1*int((80)))+(ridx0*int((6400))));
    float val4 = (float(bool(int(alu2)*int(alu3)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+(int((-81))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+(int((-81))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val5 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu7+(int((-80))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+(int((-80))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val6 = (float(bool(int(alu4)*int(alu3)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+(int((-79))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+(int((-79))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val7 = (float(alu2)!=0.0?float(texture(data1, vec2(float(float(int(alu7+(int((-1))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+(int((-1))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val8 = float(texture(data1, vec2(float(float(int(alu7)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val9 = (float(alu4)!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((1)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((1)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val10 = (float(bool(int(alu2)*int(alu5)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((79)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((79)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val11 = (float(alu5)!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((80)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((80)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val12 = (float(bool(int(alu4)*int(alu5)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((81)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((81)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    int alu8 = ((ridx0*int((9)))+(alu6*int((288))));
    float val13 = float(texture(data2, vec2(float(float(int(alu8)%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8)/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val14 = float(texture(data2, vec2(float(float(int(alu8+int((1)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((1)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val15 = float(texture(data2, vec2(float(float(int(alu8+int((2)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((2)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val16 = float(texture(data2, vec2(float(float(int(alu8+int((3)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((3)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val17 = float(texture(data2, vec2(float(float(int(alu8+int((4)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((4)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val18 = float(texture(data2, vec2(float(float(int(alu8+int((5)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((5)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val19 = float(texture(data2, vec2(float(float(int(alu8+int((6)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((6)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val20 = float(texture(data2, vec2(float(float(int(alu8+int((7)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((7)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val21 = float(texture(data2, vec2(float(float(int(alu8+int((8)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((8)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val12*val21)+((val11*val20)+((val10*val19)+((val9*val18)+((val8*val17)+((val7*val16)+((val6*val15)+((val5*val14)+((val4*val13)+acc0)))))))));
  }
  float alu9 = (((acc0-val0)*val1*float(sqrt((float((1.0))/(val2+float((0.001)))))))+val3);
  out_data = float((alu9*(float((1.0))/(float((1.0))+exp2((alu9*(float((-1.4426950408889634)))))))));
}`;

const r_204800_32_3_3n3 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
uniform sampler2D data7;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 204800 */
  float acc0 = float((0.0));
  int alu0 = (int(idx0)%int(int((80))));
  int alu1 = (int((idx0/int((80))))%int(int((80))));
  bool alu2 = (float((alu0*(int((-1)))))<float(int((0))));
  bool alu3 = (float((alu1*(int((-1)))))<float(int((0))));
  bool alu4 = (float(alu0)<float(int((79))));
  bool alu5 = (float(alu1)<float(int((79))));
  int alu6 = (idx0/int((6400)));
  float val0 = float(texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  float val1 = float(texture(data4, vec2(float(float(int(alu6)%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu6)/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val2 = float(texture(data5, vec2(float(float(int(alu6)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu6)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val3 = float(texture(data6, vec2(float(float(int(alu6)%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu6)/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  float val4 = float(texture(data7, vec2(float(float(int(alu6)%textureSize(data7, 0).x) + 0.5f)/float(textureSize(data7, 0).x), float(float(int(alu6)/textureSize(data7, 0).x) + 0.5f)/float(textureSize(data7, 0).y))).r);
  for (int ridx0 = int((0)); ridx0 < int((32)); ridx0++) {
    int alu7 = (alu0+(alu1*int((80)))+(ridx0*int((6400))));
    float val5 = (float(bool(int(alu2)*int(alu3)))!=0.0?float(texture(data2, vec2(float(float(int(alu7+(int((-81))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu7+(int((-81))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
    float val6 = (float(alu3)!=0.0?float(texture(data2, vec2(float(float(int(alu7+(int((-80))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu7+(int((-80))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
    float val7 = (float(bool(int(alu4)*int(alu3)))!=0.0?float(texture(data2, vec2(float(float(int(alu7+(int((-79))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu7+(int((-79))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
    float val8 = (float(alu2)!=0.0?float(texture(data2, vec2(float(float(int(alu7+(int((-1))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu7+(int((-1))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
    float val9 = float(texture(data2, vec2(float(float(int(alu7)%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu7)/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val10 = (float(alu4)!=0.0?float(texture(data2, vec2(float(float(int(alu7+int((1)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu7+int((1)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
    float val11 = (float(bool(int(alu2)*int(alu5)))!=0.0?float(texture(data2, vec2(float(float(int(alu7+int((79)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu7+int((79)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
    float val12 = (float(alu5)!=0.0?float(texture(data2, vec2(float(float(int(alu7+int((80)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu7+int((80)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
    float val13 = (float(bool(int(alu4)*int(alu5)))!=0.0?float(texture(data2, vec2(float(float(int(alu7+int((81)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu7+int((81)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
    int alu8 = ((ridx0*int((9)))+(alu6*int((288))));
    float val14 = float(texture(data3, vec2(float(float(int(alu8)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu8)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
    float val15 = float(texture(data3, vec2(float(float(int(alu8+int((1)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu8+int((1)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
    float val16 = float(texture(data3, vec2(float(float(int(alu8+int((2)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu8+int((2)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
    float val17 = float(texture(data3, vec2(float(float(int(alu8+int((3)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu8+int((3)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
    float val18 = float(texture(data3, vec2(float(float(int(alu8+int((4)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu8+int((4)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
    float val19 = float(texture(data3, vec2(float(float(int(alu8+int((5)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu8+int((5)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
    float val20 = float(texture(data3, vec2(float(float(int(alu8+int((6)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu8+int((6)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
    float val21 = float(texture(data3, vec2(float(float(int(alu8+int((7)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu8+int((7)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
    float val22 = float(texture(data3, vec2(float(float(int(alu8+int((8)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu8+int((8)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
    acc0 = ((val13*val22)+((val12*val21)+((val11*val20)+((val10*val19)+((val9*val18)+((val8*val17)+((val7*val16)+((val6*val15)+((val5*val14)+acc0)))))))));
  }
  float alu9 = (((acc0-val1)*val2*float(sqrt((float((1.0))/(val3+float((0.001)))))))+val4);
  out_data = float((val0+(alu9*(float((1.0))/(float((1.0))+exp2((alu9*(float((-1.4426950408889634))))))))));
}`;

const E_819200 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 819200 */
  int alu0 = (int(idx0)%int(int((614400))));
  int alu1 = (int(alu0)%int(int((409600))));
  bool alu2 = (float(idx0)<float(int((614400))));
  int alu3 = (int((idx0/int((6400))))%int(int((96))));
  bool alu4 = bool(int(alu2)*int((float(alu3)<float(int((64))))));
  int alu5 = (int(alu3)%int(int((64))));
  float val0 = (float(bool(int(alu4)*int((float(alu5)<float(int((32)))))))!=0.0?float(texture(data1, vec2(float(float(int(alu1)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val1 = (float(bool(int(alu4)*int((float((alu5*(int((-1)))))<float((int((-31))))))))!=0.0?float(texture(data1, vec2(float(float(int(alu1)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val2 = (float(bool(int(alu2)*int((float((alu3*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data2, vec2(float(float(int(alu0+(int((-409600))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu0+(int((-409600))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
  float val3 = (float((float((idx0*(int((-1)))))<float((int((-614399))))))!=0.0?float(texture(data3, vec2(float(float(int(idx0+(int((-614400))))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(idx0+(int((-614400))))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):float((0.0)));
  out_data = float((val0+val1+val2+val3));
}`;

const E_8192 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 8192 */
  float val0 = float(texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  out_data = float(float(val0));
}`;

const r_409600_32_4 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 409600 */
  float acc0 = float((0.0));
  int alu0 = (idx0/int((6400)));
  float val0 = float(texture(data3, vec2(float(float(int(alu0)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu0)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val1 = float(texture(data4, vec2(float(float(int(alu0)%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu0)/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val2 = float(texture(data5, vec2(float(float(int(alu0)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu0)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val3 = float(texture(data6, vec2(float(float(int(alu0)%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu0)/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  for (int ridx0 = int((0)); ridx0 < int((32)); ridx0++) {
    int alu1 = ((ridx0*int((25600)))+(int(idx0)%int(int((6400)))));
    float val4 = float(texture(data1, vec2(float(float(int(alu1)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val5 = float(texture(data1, vec2(float(float(int(alu1+int((6400)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1+int((6400)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val6 = float(texture(data1, vec2(float(float(int(alu1+int((12800)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1+int((12800)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val7 = float(texture(data1, vec2(float(float(int(alu1+int((19200)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1+int((19200)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    int alu2 = ((ridx0*int((4)))+(alu0*int((128))));
    float val8 = float(texture(data2, vec2(float(float(int(alu2)%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2)/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val9 = float(texture(data2, vec2(float(float(int(alu2+int((1)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((1)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val10 = float(texture(data2, vec2(float(float(int(alu2+int((2)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((2)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val11 = float(texture(data2, vec2(float(float(int(alu2+int((3)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((3)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val7*val11)+((val6*val10)+((val5*val9)+((val4*val8)+acc0))));
  }
  float alu3 = (((acc0-val0)*val1*float(sqrt((float((1.0))/(val2+float((0.001)))))))+val3);
  out_data = float((alu3*(float((1.0))/(float((1.0))+exp2((alu3*(float((-1.4426950408889634)))))))));
}`;

const E_73728 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 73728 */
  float val0 = float(texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  out_data = float(float(val0));
}`;

const E_128 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 128 */
  float val0 = float(texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  out_data = float(float(val0));
}`;

const r_204800_64_3_3 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 204800 */
  float acc0 = float((0.0));
  int alu0 = (int(idx0)%int(int((40))));
  int alu1 = (int((idx0/int((40))))%int(int((40))));
  bool alu2 = (float((alu0*(int((-1)))))<float(int((0))));
  bool alu3 = (float((alu1*(int((-1)))))<float(int((0))));
  int alu4 = (idx0/int((1600)));
  float val0 = float(texture(data3, vec2(float(float(int(alu4)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu4)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val1 = float(texture(data4, vec2(float(float(int(alu4)%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu4)/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val2 = float(texture(data5, vec2(float(float(int(alu4)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu4)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val3 = float(texture(data6, vec2(float(float(int(alu4)%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu4)/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  for (int ridx0 = int((0)); ridx0 < int((64)); ridx0++) {
    int alu5 = ((alu0*int((2)))+(alu1*int((160)))+(ridx0*int((6400))));
    float val4 = (float(bool(int(alu2)*int(alu3)))!=0.0?float(texture(data1, vec2(float(float(int(alu5+(int((-81))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5+(int((-81))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val5 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu5+(int((-80))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5+(int((-80))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val6 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu5+(int((-79))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5+(int((-79))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val7 = (float(alu2)!=0.0?float(texture(data1, vec2(float(float(int(alu5+(int((-1))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5+(int((-1))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val8 = float(texture(data1, vec2(float(float(int(alu5)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val9 = float(texture(data1, vec2(float(float(int(alu5+int((1)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5+int((1)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val10 = (float(alu2)!=0.0?float(texture(data1, vec2(float(float(int(alu5+int((79)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5+int((79)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val11 = float(texture(data1, vec2(float(float(int(alu5+int((80)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5+int((80)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val12 = float(texture(data1, vec2(float(float(int(alu5+int((81)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5+int((81)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    int alu6 = ((ridx0*int((9)))+(alu4*int((576))));
    float val13 = float(texture(data2, vec2(float(float(int(alu6)%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6)/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val14 = float(texture(data2, vec2(float(float(int(alu6+int((1)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6+int((1)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val15 = float(texture(data2, vec2(float(float(int(alu6+int((2)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6+int((2)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val16 = float(texture(data2, vec2(float(float(int(alu6+int((3)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6+int((3)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val17 = float(texture(data2, vec2(float(float(int(alu6+int((4)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6+int((4)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val18 = float(texture(data2, vec2(float(float(int(alu6+int((5)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6+int((5)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val19 = float(texture(data2, vec2(float(float(int(alu6+int((6)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6+int((6)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val20 = float(texture(data2, vec2(float(float(int(alu6+int((7)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6+int((7)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val21 = float(texture(data2, vec2(float(float(int(alu6+int((8)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6+int((8)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val12*val21)+((val11*val20)+((val10*val19)+((val9*val18)+((val8*val17)+((val7*val16)+((val6*val15)+((val5*val14)+((val4*val13)+acc0)))))))));
  }
  float alu7 = (((acc0-val0)*val1*float(sqrt((float((1.0))/(val2+float((0.001)))))))+val3);
  out_data = float((alu7*(float((1.0))/(float((1.0))+exp2((alu7*(float((-1.4426950408889634)))))))));
}`;

const E_16384 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 16384 */
  float val0 = float(texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  out_data = float(float(val0));
}`;

const r_204800_32_4 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 204800 */
  float acc0 = float((0.0));
  int alu0 = (idx0/int((1600)));
  float val0 = float(texture(data3, vec2(float(float(int(alu0)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu0)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val1 = float(texture(data4, vec2(float(float(int(alu0)%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu0)/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val2 = float(texture(data5, vec2(float(float(int(alu0)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu0)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val3 = float(texture(data6, vec2(float(float(int(alu0)%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu0)/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  for (int ridx0 = int((0)); ridx0 < int((32)); ridx0++) {
    int alu1 = ((ridx0*int((6400)))+(int(idx0)%int(int((1600)))));
    float val4 = float(texture(data1, vec2(float(float(int(alu1)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val5 = float(texture(data1, vec2(float(float(int(alu1+int((1600)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1+int((1600)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val6 = float(texture(data1, vec2(float(float(int(alu1+int((3200)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1+int((3200)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val7 = float(texture(data1, vec2(float(float(int(alu1+int((4800)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1+int((4800)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    int alu2 = ((ridx0*int((4)))+(alu0*int((128))));
    float val8 = float(texture(data2, vec2(float(float(int(alu2)%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2)/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val9 = float(texture(data2, vec2(float(float(int(alu2+int((1)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((1)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val10 = float(texture(data2, vec2(float(float(int(alu2+int((2)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((2)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val11 = float(texture(data2, vec2(float(float(int(alu2+int((3)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((3)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val7*val11)+((val6*val10)+((val5*val9)+((val4*val8)+acc0))));
  }
  float alu3 = (((acc0-val0)*val1*float(sqrt((float((1.0))/(val2+float((0.001)))))))+val3);
  out_data = float((alu3*(float((1.0))/(float((1.0))+exp2((alu3*(float((-1.4426950408889634)))))))));
}`;

const E_36864 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 36864 */
  float val0 = float(texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  out_data = float(float(val0));
}`;

const r_102400_64_3_3 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 102400 */
  float acc0 = float((0.0));
  int alu0 = (int(idx0)%int(int((40))));
  int alu1 = (int((idx0/int((40))))%int(int((40))));
  bool alu2 = (float((alu0*(int((-1)))))<float(int((0))));
  bool alu3 = (float((alu1*(int((-1)))))<float(int((0))));
  bool alu4 = (float(alu0)<float(int((39))));
  bool alu5 = (float(alu1)<float(int((39))));
  int alu6 = (idx0/int((1600)));
  float val0 = float(texture(data3, vec2(float(float(int(alu6)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu6)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val1 = float(texture(data4, vec2(float(float(int(alu6)%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu6)/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val2 = float(texture(data5, vec2(float(float(int(alu6)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu6)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val3 = float(texture(data6, vec2(float(float(int(alu6)%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu6)/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  for (int ridx0 = int((0)); ridx0 < int((64)); ridx0++) {
    int alu7 = (alu0+(alu1*int((40)))+(ridx0*int((1600))));
    float val4 = (float(bool(int(alu2)*int(alu3)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((102359)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((102359)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val5 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((102360)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((102360)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val6 = (float(bool(int(alu4)*int(alu3)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((102361)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((102361)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val7 = (float(alu2)!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((102399)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((102399)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val8 = float(texture(data1, vec2(float(float(int(alu7+int((102400)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((102400)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val9 = (float(alu4)!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((102401)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((102401)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val10 = (float(bool(int(alu2)*int(alu5)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((102439)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((102439)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val11 = (float(alu5)!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((102440)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((102440)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val12 = (float(bool(int(alu4)*int(alu5)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((102441)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((102441)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    int alu8 = ((ridx0*int((9)))+(alu6*int((576))));
    float val13 = float(texture(data2, vec2(float(float(int(alu8)%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8)/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val14 = float(texture(data2, vec2(float(float(int(alu8+int((1)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((1)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val15 = float(texture(data2, vec2(float(float(int(alu8+int((2)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((2)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val16 = float(texture(data2, vec2(float(float(int(alu8+int((3)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((3)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val17 = float(texture(data2, vec2(float(float(int(alu8+int((4)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((4)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val18 = float(texture(data2, vec2(float(float(int(alu8+int((5)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((5)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val19 = float(texture(data2, vec2(float(float(int(alu8+int((6)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((6)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val20 = float(texture(data2, vec2(float(float(int(alu8+int((7)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((7)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val21 = float(texture(data2, vec2(float(float(int(alu8+int((8)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((8)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val12*val21)+((val11*val20)+((val10*val19)+((val9*val18)+((val8*val17)+((val7*val16)+((val6*val15)+((val5*val14)+((val4*val13)+acc0)))))))));
  }
  float alu9 = (((acc0-val0)*val1*float(sqrt((float((1.0))/(val2+float((0.001)))))))+val3);
  out_data = float((alu9*(float((1.0))/(float((1.0))+exp2((alu9*(float((-1.4426950408889634)))))))));
}`;

const r_102400_64_3_3n1 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
uniform sampler2D data7;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 102400 */
  float acc0 = float((0.0));
  int alu0 = (int(idx0)%int(int((40))));
  int alu1 = (int((idx0/int((40))))%int(int((40))));
  bool alu2 = (float((alu0*(int((-1)))))<float(int((0))));
  bool alu3 = (float((alu1*(int((-1)))))<float(int((0))));
  bool alu4 = (float(alu0)<float(int((39))));
  bool alu5 = (float(alu1)<float(int((39))));
  int alu6 = (idx0/int((1600)));
  float val0 = float(texture(data1, vec2(float(float(int(idx0+int((102400)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0+int((102400)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  float val1 = float(texture(data4, vec2(float(float(int(alu6)%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu6)/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val2 = float(texture(data5, vec2(float(float(int(alu6)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu6)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val3 = float(texture(data6, vec2(float(float(int(alu6)%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu6)/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  float val4 = float(texture(data7, vec2(float(float(int(alu6)%textureSize(data7, 0).x) + 0.5f)/float(textureSize(data7, 0).x), float(float(int(alu6)/textureSize(data7, 0).x) + 0.5f)/float(textureSize(data7, 0).y))).r);
  for (int ridx0 = int((0)); ridx0 < int((64)); ridx0++) {
    int alu7 = (alu0+(alu1*int((40)))+(ridx0*int((1600))));
    float val5 = (float(bool(int(alu2)*int(alu3)))!=0.0?float(texture(data2, vec2(float(float(int(alu7+(int((-41))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu7+(int((-41))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
    float val6 = (float(alu3)!=0.0?float(texture(data2, vec2(float(float(int(alu7+(int((-40))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu7+(int((-40))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
    float val7 = (float(bool(int(alu4)*int(alu3)))!=0.0?float(texture(data2, vec2(float(float(int(alu7+(int((-39))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu7+(int((-39))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
    float val8 = (float(alu2)!=0.0?float(texture(data2, vec2(float(float(int(alu7+(int((-1))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu7+(int((-1))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
    float val9 = float(texture(data2, vec2(float(float(int(alu7)%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu7)/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val10 = (float(alu4)!=0.0?float(texture(data2, vec2(float(float(int(alu7+int((1)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu7+int((1)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
    float val11 = (float(bool(int(alu2)*int(alu5)))!=0.0?float(texture(data2, vec2(float(float(int(alu7+int((39)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu7+int((39)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
    float val12 = (float(alu5)!=0.0?float(texture(data2, vec2(float(float(int(alu7+int((40)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu7+int((40)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
    float val13 = (float(bool(int(alu4)*int(alu5)))!=0.0?float(texture(data2, vec2(float(float(int(alu7+int((41)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu7+int((41)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
    int alu8 = ((ridx0*int((9)))+(alu6*int((576))));
    float val14 = float(texture(data3, vec2(float(float(int(alu8)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu8)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
    float val15 = float(texture(data3, vec2(float(float(int(alu8+int((1)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu8+int((1)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
    float val16 = float(texture(data3, vec2(float(float(int(alu8+int((2)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu8+int((2)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
    float val17 = float(texture(data3, vec2(float(float(int(alu8+int((3)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu8+int((3)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
    float val18 = float(texture(data3, vec2(float(float(int(alu8+int((4)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu8+int((4)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
    float val19 = float(texture(data3, vec2(float(float(int(alu8+int((5)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu8+int((5)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
    float val20 = float(texture(data3, vec2(float(float(int(alu8+int((6)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu8+int((6)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
    float val21 = float(texture(data3, vec2(float(float(int(alu8+int((7)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu8+int((7)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
    float val22 = float(texture(data3, vec2(float(float(int(alu8+int((8)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu8+int((8)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
    acc0 = ((val13*val22)+((val12*val21)+((val11*val20)+((val10*val19)+((val9*val18)+((val8*val17)+((val7*val16)+((val6*val15)+((val5*val14)+acc0)))))))));
  }
  float alu9 = (((acc0-val1)*val2*float(sqrt((float((1.0))/(val3+float((0.001)))))))+val4);
  out_data = float((val0+(alu9*(float((1.0))/(float((1.0))+exp2((alu9*(float((-1.4426950408889634))))))))));
}`;

const r_102400_64_3_3n2 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 102400 */
  float acc0 = float((0.0));
  int alu0 = (int(idx0)%int(int((40))));
  int alu1 = (int((idx0/int((40))))%int(int((40))));
  bool alu2 = (float((alu0*(int((-1)))))<float(int((0))));
  bool alu3 = (float((alu1*(int((-1)))))<float(int((0))));
  bool alu4 = (float(alu0)<float(int((39))));
  bool alu5 = (float(alu1)<float(int((39))));
  int alu6 = (idx0/int((1600)));
  float val0 = float(texture(data3, vec2(float(float(int(alu6)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu6)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val1 = float(texture(data4, vec2(float(float(int(alu6)%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu6)/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val2 = float(texture(data5, vec2(float(float(int(alu6)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu6)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val3 = float(texture(data6, vec2(float(float(int(alu6)%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu6)/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  for (int ridx0 = int((0)); ridx0 < int((64)); ridx0++) {
    int alu7 = (alu0+(alu1*int((40)))+(ridx0*int((1600))));
    float val4 = (float(bool(int(alu2)*int(alu3)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+(int((-41))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+(int((-41))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val5 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu7+(int((-40))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+(int((-40))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val6 = (float(bool(int(alu4)*int(alu3)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+(int((-39))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+(int((-39))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val7 = (float(alu2)!=0.0?float(texture(data1, vec2(float(float(int(alu7+(int((-1))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+(int((-1))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val8 = float(texture(data1, vec2(float(float(int(alu7)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val9 = (float(alu4)!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((1)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((1)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val10 = (float(bool(int(alu2)*int(alu5)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((39)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((39)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val11 = (float(alu5)!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((40)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((40)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val12 = (float(bool(int(alu4)*int(alu5)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((41)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((41)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    int alu8 = ((ridx0*int((9)))+(alu6*int((576))));
    float val13 = float(texture(data2, vec2(float(float(int(alu8)%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8)/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val14 = float(texture(data2, vec2(float(float(int(alu8+int((1)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((1)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val15 = float(texture(data2, vec2(float(float(int(alu8+int((2)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((2)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val16 = float(texture(data2, vec2(float(float(int(alu8+int((3)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((3)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val17 = float(texture(data2, vec2(float(float(int(alu8+int((4)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((4)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val18 = float(texture(data2, vec2(float(float(int(alu8+int((5)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((5)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val19 = float(texture(data2, vec2(float(float(int(alu8+int((6)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((6)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val20 = float(texture(data2, vec2(float(float(int(alu8+int((7)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((7)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val21 = float(texture(data2, vec2(float(float(int(alu8+int((8)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((8)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val12*val21)+((val11*val20)+((val10*val19)+((val9*val18)+((val8*val17)+((val7*val16)+((val6*val15)+((val5*val14)+((val4*val13)+acc0)))))))));
  }
  float alu9 = (((acc0-val0)*val1*float(sqrt((float((1.0))/(val2+float((0.001)))))))+val3);
  out_data = float((alu9*(float((1.0))/(float((1.0))+exp2((alu9*(float((-1.4426950408889634)))))))));
}`;

const r_102400_64_3_3n3 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
uniform sampler2D data7;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 102400 */
  float acc0 = float((0.0));
  int alu0 = (int(idx0)%int(int((40))));
  int alu1 = (int((idx0/int((40))))%int(int((40))));
  bool alu2 = (float((alu0*(int((-1)))))<float(int((0))));
  bool alu3 = (float((alu1*(int((-1)))))<float(int((0))));
  bool alu4 = (float(alu0)<float(int((39))));
  bool alu5 = (float(alu1)<float(int((39))));
  int alu6 = (idx0/int((1600)));
  float val0 = float(texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  float val1 = float(texture(data4, vec2(float(float(int(alu6)%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu6)/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val2 = float(texture(data5, vec2(float(float(int(alu6)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu6)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val3 = float(texture(data6, vec2(float(float(int(alu6)%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu6)/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  float val4 = float(texture(data7, vec2(float(float(int(alu6)%textureSize(data7, 0).x) + 0.5f)/float(textureSize(data7, 0).x), float(float(int(alu6)/textureSize(data7, 0).x) + 0.5f)/float(textureSize(data7, 0).y))).r);
  for (int ridx0 = int((0)); ridx0 < int((64)); ridx0++) {
    int alu7 = (alu0+(alu1*int((40)))+(ridx0*int((1600))));
    float val5 = (float(bool(int(alu2)*int(alu3)))!=0.0?float(texture(data2, vec2(float(float(int(alu7+(int((-41))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu7+(int((-41))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
    float val6 = (float(alu3)!=0.0?float(texture(data2, vec2(float(float(int(alu7+(int((-40))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu7+(int((-40))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
    float val7 = (float(bool(int(alu4)*int(alu3)))!=0.0?float(texture(data2, vec2(float(float(int(alu7+(int((-39))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu7+(int((-39))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
    float val8 = (float(alu2)!=0.0?float(texture(data2, vec2(float(float(int(alu7+(int((-1))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu7+(int((-1))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
    float val9 = float(texture(data2, vec2(float(float(int(alu7)%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu7)/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val10 = (float(alu4)!=0.0?float(texture(data2, vec2(float(float(int(alu7+int((1)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu7+int((1)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
    float val11 = (float(bool(int(alu2)*int(alu5)))!=0.0?float(texture(data2, vec2(float(float(int(alu7+int((39)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu7+int((39)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
    float val12 = (float(alu5)!=0.0?float(texture(data2, vec2(float(float(int(alu7+int((40)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu7+int((40)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
    float val13 = (float(bool(int(alu4)*int(alu5)))!=0.0?float(texture(data2, vec2(float(float(int(alu7+int((41)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu7+int((41)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
    int alu8 = ((ridx0*int((9)))+(alu6*int((576))));
    float val14 = float(texture(data3, vec2(float(float(int(alu8)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu8)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
    float val15 = float(texture(data3, vec2(float(float(int(alu8+int((1)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu8+int((1)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
    float val16 = float(texture(data3, vec2(float(float(int(alu8+int((2)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu8+int((2)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
    float val17 = float(texture(data3, vec2(float(float(int(alu8+int((3)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu8+int((3)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
    float val18 = float(texture(data3, vec2(float(float(int(alu8+int((4)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu8+int((4)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
    float val19 = float(texture(data3, vec2(float(float(int(alu8+int((5)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu8+int((5)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
    float val20 = float(texture(data3, vec2(float(float(int(alu8+int((6)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu8+int((6)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
    float val21 = float(texture(data3, vec2(float(float(int(alu8+int((7)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu8+int((7)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
    float val22 = float(texture(data3, vec2(float(float(int(alu8+int((8)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu8+int((8)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
    acc0 = ((val13*val22)+((val12*val21)+((val11*val20)+((val10*val19)+((val9*val18)+((val8*val17)+((val7*val16)+((val6*val15)+((val5*val14)+acc0)))))))));
  }
  float alu9 = (((acc0-val1)*val2*float(sqrt((float((1.0))/(val3+float((0.001)))))))+val4);
  out_data = float((val0+(alu9*(float((1.0))/(float((1.0))+exp2((alu9*(float((-1.4426950408889634))))))))));
}`;

const E_409600 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 409600 */
  int alu0 = (int(idx0)%int(int((307200))));
  int alu1 = (int(alu0)%int(int((204800))));
  bool alu2 = (float(idx0)<float(int((307200))));
  int alu3 = (int((idx0/int((1600))))%int(int((192))));
  bool alu4 = bool(int(alu2)*int((float(alu3)<float(int((128))))));
  int alu5 = (int(alu3)%int(int((128))));
  float val0 = (float(bool(int(alu4)*int((float(alu5)<float(int((64)))))))!=0.0?float(texture(data1, vec2(float(float(int(alu1)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val1 = (float(bool(int(alu4)*int((float((alu5*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data1, vec2(float(float(int(alu1)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val2 = (float(bool(int(alu2)*int((float((alu3*(int((-1)))))<float((int((-127))))))))!=0.0?float(texture(data2, vec2(float(float(int(alu0+(int((-204800))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu0+(int((-204800))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
  float val3 = (float((float((idx0*(int((-1)))))<float((int((-307199))))))!=0.0?float(texture(data3, vec2(float(float(int(idx0+(int((-307200))))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(idx0+(int((-307200))))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):float((0.0)));
  out_data = float((val0+val1+val2+val3));
}`;

const E_32768 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 32768 */
  float val0 = float(texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  out_data = float(float(val0));
}`;

const r_204800_64_4 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 204800 */
  float acc0 = float((0.0));
  int alu0 = (idx0/int((1600)));
  float val0 = float(texture(data3, vec2(float(float(int(alu0)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu0)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val1 = float(texture(data4, vec2(float(float(int(alu0)%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu0)/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val2 = float(texture(data5, vec2(float(float(int(alu0)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu0)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val3 = float(texture(data6, vec2(float(float(int(alu0)%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu0)/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  for (int ridx0 = int((0)); ridx0 < int((64)); ridx0++) {
    int alu1 = ((ridx0*int((6400)))+(int(idx0)%int(int((1600)))));
    float val4 = float(texture(data1, vec2(float(float(int(alu1)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val5 = float(texture(data1, vec2(float(float(int(alu1+int((1600)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1+int((1600)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val6 = float(texture(data1, vec2(float(float(int(alu1+int((3200)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1+int((3200)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val7 = float(texture(data1, vec2(float(float(int(alu1+int((4800)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1+int((4800)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    int alu2 = ((ridx0*int((4)))+(alu0*int((256))));
    float val8 = float(texture(data2, vec2(float(float(int(alu2)%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2)/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val9 = float(texture(data2, vec2(float(float(int(alu2+int((1)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((1)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val10 = float(texture(data2, vec2(float(float(int(alu2+int((2)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((2)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val11 = float(texture(data2, vec2(float(float(int(alu2+int((3)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((3)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val7*val11)+((val6*val10)+((val5*val9)+((val4*val8)+acc0))));
  }
  float alu3 = (((acc0-val0)*val1*float(sqrt((float((1.0))/(val2+float((0.001)))))))+val3);
  out_data = float((alu3*(float((1.0))/(float((1.0))+exp2((alu3*(float((-1.4426950408889634)))))))));
}`;

const E_294912 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 294912 */
  float val0 = float(texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  out_data = float(float(val0));
}`;

const E_256 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 256 */
  float val0 = float(texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  out_data = float(float(val0));
}`;

const r_102400_128_3_3 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 102400 */
  float acc0 = float((0.0));
  int alu0 = (int(idx0)%int(int((20))));
  int alu1 = (int((idx0/int((20))))%int(int((20))));
  bool alu2 = (float((alu0*(int((-1)))))<float(int((0))));
  bool alu3 = (float((alu1*(int((-1)))))<float(int((0))));
  int alu4 = (idx0/int((400)));
  float val0 = float(texture(data3, vec2(float(float(int(alu4)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu4)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val1 = float(texture(data4, vec2(float(float(int(alu4)%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu4)/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val2 = float(texture(data5, vec2(float(float(int(alu4)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu4)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val3 = float(texture(data6, vec2(float(float(int(alu4)%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu4)/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  for (int ridx0 = int((0)); ridx0 < int((128)); ridx0++) {
    int alu5 = ((alu0*int((2)))+(alu1*int((80)))+(ridx0*int((1600))));
    float val4 = (float(bool(int(alu2)*int(alu3)))!=0.0?float(texture(data1, vec2(float(float(int(alu5+(int((-41))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5+(int((-41))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val5 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu5+(int((-40))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5+(int((-40))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val6 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu5+(int((-39))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5+(int((-39))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val7 = (float(alu2)!=0.0?float(texture(data1, vec2(float(float(int(alu5+(int((-1))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5+(int((-1))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val8 = float(texture(data1, vec2(float(float(int(alu5)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val9 = float(texture(data1, vec2(float(float(int(alu5+int((1)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5+int((1)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val10 = (float(alu2)!=0.0?float(texture(data1, vec2(float(float(int(alu5+int((39)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5+int((39)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val11 = float(texture(data1, vec2(float(float(int(alu5+int((40)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5+int((40)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val12 = float(texture(data1, vec2(float(float(int(alu5+int((41)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5+int((41)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    int alu6 = ((ridx0*int((9)))+(alu4*int((1152))));
    float val13 = float(texture(data2, vec2(float(float(int(alu6)%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6)/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val14 = float(texture(data2, vec2(float(float(int(alu6+int((1)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6+int((1)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val15 = float(texture(data2, vec2(float(float(int(alu6+int((2)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6+int((2)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val16 = float(texture(data2, vec2(float(float(int(alu6+int((3)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6+int((3)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val17 = float(texture(data2, vec2(float(float(int(alu6+int((4)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6+int((4)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val18 = float(texture(data2, vec2(float(float(int(alu6+int((5)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6+int((5)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val19 = float(texture(data2, vec2(float(float(int(alu6+int((6)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6+int((6)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val20 = float(texture(data2, vec2(float(float(int(alu6+int((7)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6+int((7)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val21 = float(texture(data2, vec2(float(float(int(alu6+int((8)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6+int((8)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val12*val21)+((val11*val20)+((val10*val19)+((val9*val18)+((val8*val17)+((val7*val16)+((val6*val15)+((val5*val14)+((val4*val13)+acc0)))))))));
  }
  float alu7 = (((acc0-val0)*val1*float(sqrt((float((1.0))/(val2+float((0.001)))))))+val3);
  out_data = float((alu7*(float((1.0))/(float((1.0))+exp2((alu7*(float((-1.4426950408889634)))))))));
}`;

const E_65536 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 65536 */
  float val0 = float(texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  out_data = float(float(val0));
}`;

const r_102400_64_4 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 102400 */
  float acc0 = float((0.0));
  int alu0 = (idx0/int((400)));
  float val0 = float(texture(data3, vec2(float(float(int(alu0)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu0)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val1 = float(texture(data4, vec2(float(float(int(alu0)%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu0)/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val2 = float(texture(data5, vec2(float(float(int(alu0)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu0)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val3 = float(texture(data6, vec2(float(float(int(alu0)%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu0)/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  for (int ridx0 = int((0)); ridx0 < int((64)); ridx0++) {
    int alu1 = ((ridx0*int((1600)))+(int(idx0)%int(int((400)))));
    float val4 = float(texture(data1, vec2(float(float(int(alu1)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val5 = float(texture(data1, vec2(float(float(int(alu1+int((400)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1+int((400)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val6 = float(texture(data1, vec2(float(float(int(alu1+int((800)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1+int((800)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val7 = float(texture(data1, vec2(float(float(int(alu1+int((1200)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1+int((1200)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    int alu2 = ((ridx0*int((4)))+(alu0*int((256))));
    float val8 = float(texture(data2, vec2(float(float(int(alu2)%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2)/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val9 = float(texture(data2, vec2(float(float(int(alu2+int((1)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((1)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val10 = float(texture(data2, vec2(float(float(int(alu2+int((2)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((2)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val11 = float(texture(data2, vec2(float(float(int(alu2+int((3)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((3)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val7*val11)+((val6*val10)+((val5*val9)+((val4*val8)+acc0))));
  }
  float alu3 = (((acc0-val0)*val1*float(sqrt((float((1.0))/(val2+float((0.001)))))))+val3);
  out_data = float((alu3*(float((1.0))/(float((1.0))+exp2((alu3*(float((-1.4426950408889634)))))))));
}`;

const E_147456 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 147456 */
  float val0 = float(texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  out_data = float(float(val0));
}`;

const r_51200_128_3_3 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 51200 */
  float acc0 = float((0.0));
  int alu0 = (int(idx0)%int(int((20))));
  int alu1 = (int((idx0/int((20))))%int(int((20))));
  bool alu2 = (float((alu0*(int((-1)))))<float(int((0))));
  bool alu3 = (float((alu1*(int((-1)))))<float(int((0))));
  bool alu4 = (float(alu0)<float(int((19))));
  bool alu5 = (float(alu1)<float(int((19))));
  int alu6 = (idx0/int((400)));
  float val0 = float(texture(data3, vec2(float(float(int(alu6)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu6)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val1 = float(texture(data4, vec2(float(float(int(alu6)%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu6)/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val2 = float(texture(data5, vec2(float(float(int(alu6)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu6)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val3 = float(texture(data6, vec2(float(float(int(alu6)%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu6)/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  for (int ridx0 = int((0)); ridx0 < int((128)); ridx0++) {
    int alu7 = (alu0+(alu1*int((20)))+(ridx0*int((400))));
    float val4 = (float(bool(int(alu2)*int(alu3)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((51179)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((51179)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val5 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((51180)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((51180)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val6 = (float(bool(int(alu4)*int(alu3)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((51181)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((51181)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val7 = (float(alu2)!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((51199)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((51199)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val8 = float(texture(data1, vec2(float(float(int(alu7+int((51200)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((51200)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val9 = (float(alu4)!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((51201)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((51201)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val10 = (float(bool(int(alu2)*int(alu5)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((51219)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((51219)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val11 = (float(alu5)!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((51220)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((51220)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val12 = (float(bool(int(alu4)*int(alu5)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((51221)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((51221)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    int alu8 = ((ridx0*int((9)))+(alu6*int((1152))));
    float val13 = float(texture(data2, vec2(float(float(int(alu8)%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8)/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val14 = float(texture(data2, vec2(float(float(int(alu8+int((1)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((1)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val15 = float(texture(data2, vec2(float(float(int(alu8+int((2)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((2)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val16 = float(texture(data2, vec2(float(float(int(alu8+int((3)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((3)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val17 = float(texture(data2, vec2(float(float(int(alu8+int((4)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((4)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val18 = float(texture(data2, vec2(float(float(int(alu8+int((5)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((5)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val19 = float(texture(data2, vec2(float(float(int(alu8+int((6)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((6)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val20 = float(texture(data2, vec2(float(float(int(alu8+int((7)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((7)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val21 = float(texture(data2, vec2(float(float(int(alu8+int((8)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((8)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val12*val21)+((val11*val20)+((val10*val19)+((val9*val18)+((val8*val17)+((val7*val16)+((val6*val15)+((val5*val14)+((val4*val13)+acc0)))))))));
  }
  float alu9 = (((acc0-val0)*val1*float(sqrt((float((1.0))/(val2+float((0.001)))))))+val3);
  out_data = float((alu9*(float((1.0))/(float((1.0))+exp2((alu9*(float((-1.4426950408889634)))))))));
}`;

const r_51200_128_3_3n1 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
uniform sampler2D data7;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 51200 */
  float acc0 = float((0.0));
  int alu0 = (int(idx0)%int(int((20))));
  int alu1 = (int((idx0/int((20))))%int(int((20))));
  bool alu2 = (float((alu0*(int((-1)))))<float(int((0))));
  bool alu3 = (float((alu1*(int((-1)))))<float(int((0))));
  bool alu4 = (float(alu0)<float(int((19))));
  bool alu5 = (float(alu1)<float(int((19))));
  int alu6 = (idx0/int((400)));
  float val0 = float(texture(data1, vec2(float(float(int(idx0+int((51200)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0+int((51200)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  float val1 = float(texture(data4, vec2(float(float(int(alu6)%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu6)/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val2 = float(texture(data5, vec2(float(float(int(alu6)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu6)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val3 = float(texture(data6, vec2(float(float(int(alu6)%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu6)/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  float val4 = float(texture(data7, vec2(float(float(int(alu6)%textureSize(data7, 0).x) + 0.5f)/float(textureSize(data7, 0).x), float(float(int(alu6)/textureSize(data7, 0).x) + 0.5f)/float(textureSize(data7, 0).y))).r);
  for (int ridx0 = int((0)); ridx0 < int((128)); ridx0++) {
    int alu7 = (alu0+(alu1*int((20)))+(ridx0*int((400))));
    float val5 = (float(bool(int(alu2)*int(alu3)))!=0.0?float(texture(data2, vec2(float(float(int(alu7+(int((-21))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu7+(int((-21))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
    float val6 = (float(alu3)!=0.0?float(texture(data2, vec2(float(float(int(alu7+(int((-20))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu7+(int((-20))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
    float val7 = (float(bool(int(alu4)*int(alu3)))!=0.0?float(texture(data2, vec2(float(float(int(alu7+(int((-19))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu7+(int((-19))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
    float val8 = (float(alu2)!=0.0?float(texture(data2, vec2(float(float(int(alu7+(int((-1))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu7+(int((-1))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
    float val9 = float(texture(data2, vec2(float(float(int(alu7)%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu7)/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val10 = (float(alu4)!=0.0?float(texture(data2, vec2(float(float(int(alu7+int((1)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu7+int((1)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
    float val11 = (float(bool(int(alu2)*int(alu5)))!=0.0?float(texture(data2, vec2(float(float(int(alu7+int((19)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu7+int((19)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
    float val12 = (float(alu5)!=0.0?float(texture(data2, vec2(float(float(int(alu7+int((20)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu7+int((20)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
    float val13 = (float(bool(int(alu4)*int(alu5)))!=0.0?float(texture(data2, vec2(float(float(int(alu7+int((21)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu7+int((21)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
    int alu8 = ((ridx0*int((9)))+(alu6*int((1152))));
    float val14 = float(texture(data3, vec2(float(float(int(alu8)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu8)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
    float val15 = float(texture(data3, vec2(float(float(int(alu8+int((1)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu8+int((1)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
    float val16 = float(texture(data3, vec2(float(float(int(alu8+int((2)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu8+int((2)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
    float val17 = float(texture(data3, vec2(float(float(int(alu8+int((3)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu8+int((3)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
    float val18 = float(texture(data3, vec2(float(float(int(alu8+int((4)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu8+int((4)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
    float val19 = float(texture(data3, vec2(float(float(int(alu8+int((5)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu8+int((5)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
    float val20 = float(texture(data3, vec2(float(float(int(alu8+int((6)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu8+int((6)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
    float val21 = float(texture(data3, vec2(float(float(int(alu8+int((7)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu8+int((7)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
    float val22 = float(texture(data3, vec2(float(float(int(alu8+int((8)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu8+int((8)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
    acc0 = ((val13*val22)+((val12*val21)+((val11*val20)+((val10*val19)+((val9*val18)+((val8*val17)+((val7*val16)+((val6*val15)+((val5*val14)+acc0)))))))));
  }
  float alu9 = (((acc0-val1)*val2*float(sqrt((float((1.0))/(val3+float((0.001)))))))+val4);
  out_data = float((val0+(alu9*(float((1.0))/(float((1.0))+exp2((alu9*(float((-1.4426950408889634))))))))));
}`;

const E_153600 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 153600 */
  int alu0 = (int(idx0)%int(int((102400))));
  bool alu1 = (float(idx0)<float(int((102400))));
  int alu2 = (int((idx0/int((400))))%int(int((256))));
  float val0 = (float(bool(int(alu1)*int((float(alu2)<float(int((128)))))))!=0.0?float(texture(data1, vec2(float(float(int(alu0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val1 = (float(bool(int(alu1)*int((float((alu2*(int((-1)))))<float((int((-127))))))))!=0.0?float(texture(data1, vec2(float(float(int(alu0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val2 = (float((float((idx0*(int((-1)))))<float((int((-102399))))))!=0.0?float(texture(data2, vec2(float(float(int(idx0+(int((-102400))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(idx0+(int((-102400))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
  out_data = float((val0+val1+val2));
}`;

const E_98304 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 98304 */
  float val0 = float(texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  out_data = float(float(val0));
}`;

const r_102400_96_4 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 102400 */
  float acc0 = float((0.0));
  int alu0 = (idx0/int((400)));
  float val0 = float(texture(data3, vec2(float(float(int(alu0)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu0)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val1 = float(texture(data4, vec2(float(float(int(alu0)%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu0)/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val2 = float(texture(data5, vec2(float(float(int(alu0)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu0)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val3 = float(texture(data6, vec2(float(float(int(alu0)%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu0)/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  for (int ridx0 = int((0)); ridx0 < int((96)); ridx0++) {
    int alu1 = ((ridx0*int((1600)))+(int(idx0)%int(int((400)))));
    float val4 = float(texture(data1, vec2(float(float(int(alu1)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val5 = float(texture(data1, vec2(float(float(int(alu1+int((400)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1+int((400)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val6 = float(texture(data1, vec2(float(float(int(alu1+int((800)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1+int((800)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val7 = float(texture(data1, vec2(float(float(int(alu1+int((1200)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1+int((1200)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    int alu2 = ((ridx0*int((4)))+(alu0*int((384))));
    float val8 = float(texture(data2, vec2(float(float(int(alu2)%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2)/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val9 = float(texture(data2, vec2(float(float(int(alu2+int((1)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((1)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val10 = float(texture(data2, vec2(float(float(int(alu2+int((2)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((2)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val11 = float(texture(data2, vec2(float(float(int(alu2+int((3)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((3)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val7*val11)+((val6*val10)+((val5*val9)+((val4*val8)+acc0))));
  }
  float alu3 = (((acc0-val0)*val1*float(sqrt((float((1.0))/(val2+float((0.001)))))))+val3);
  out_data = float((alu3*(float((1.0))/(float((1.0))+exp2((alu3*(float((-1.4426950408889634)))))))));
}`;

const r_51200_64_4 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 51200 */
  float acc0 = float((0.0));
  int alu0 = (idx0/int((400)));
  float val0 = float(texture(data3, vec2(float(float(int(alu0)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu0)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val1 = float(texture(data4, vec2(float(float(int(alu0)%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu0)/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val2 = float(texture(data5, vec2(float(float(int(alu0)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu0)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val3 = float(texture(data6, vec2(float(float(int(alu0)%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu0)/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  for (int ridx0 = int((0)); ridx0 < int((64)); ridx0++) {
    int alu1 = ((ridx0*int((1600)))+(int(idx0)%int(int((400)))));
    float val4 = float(texture(data1, vec2(float(float(int(alu1)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val5 = float(texture(data1, vec2(float(float(int(alu1+int((400)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1+int((400)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val6 = float(texture(data1, vec2(float(float(int(alu1+int((800)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1+int((800)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val7 = float(texture(data1, vec2(float(float(int(alu1+int((1200)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1+int((1200)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    int alu2 = ((ridx0*int((4)))+(alu0*int((256))));
    float val8 = float(texture(data2, vec2(float(float(int(alu2)%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2)/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val9 = float(texture(data2, vec2(float(float(int(alu2+int((1)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((1)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val10 = float(texture(data2, vec2(float(float(int(alu2+int((2)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((2)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val11 = float(texture(data2, vec2(float(float(int(alu2+int((3)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((3)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val7*val11)+((val6*val10)+((val5*val9)+((val4*val8)+acc0))));
  }
  float alu3 = (((acc0-val0)*val1*float(sqrt((float((1.0))/(val2+float((0.001)))))))+val3);
  out_data = float((alu3*(float((1.0))/(float((1.0))+exp2((alu3*(float((-1.4426950408889634)))))))));
}`;

const r_51200_5_5 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 51200 */
  float acc0 = -(1./0.);
  int alu0 = (int(idx0)%int(int((20))));
  int alu1 = (int((idx0/int((20))))%int(int((20))));
  int alu2 = (alu0*(int((-1))));
  for (int ridx0 = int((0)); ridx0 < int((5)); ridx0++) {
    int alu3 = (alu0+(ridx0*int((20)))+(alu1*int((20)))+((idx0/int((400)))*int((400))));
    bool alu4 = (float(((ridx0*(int((-1))))+(alu1*(int((-1))))))<float((int((-1)))));
    bool alu5 = (float((ridx0+alu1))<float(int((22))));
    float val0 = (float(bool(int(bool(int((float(alu2)<float((int((-1))))))*int(alu4)))*int(alu5)))!=0.0?float(texture(data1, vec2(float(float(int(alu3+(int((-42))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu3+(int((-42))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val1 = (float(bool(int(bool(int((float(alu2)<float(int((0)))))*int(alu4)))*int(alu5)))!=0.0?float(texture(data1, vec2(float(float(int(alu3+(int((-41))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu3+(int((-41))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val2 = (float(bool(int(alu4)*int(alu5)))!=0.0?float(texture(data1, vec2(float(float(int(alu3+(int((-40))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu3+(int((-40))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val3 = (float(bool(int(bool(int((float(alu0)<float(int((19)))))*int(alu4)))*int(alu5)))!=0.0?float(texture(data1, vec2(float(float(int(alu3+(int((-39))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu3+(int((-39))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val4 = (float(bool(int(bool(int((float(alu0)<float(int((18)))))*int(alu4)))*int(alu5)))!=0.0?float(texture(data1, vec2(float(float(int(alu3+(int((-38))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu3+(int((-38))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float alu6 = max(val0,acc0);
    float alu7 = max(val1,alu6);
    float alu8 = max(val2,alu7);
    float alu9 = max(val3,alu8);
    float alu10 = max(val4,alu9);
    acc0 = alu10;
  }
  out_data = float(acc0);
}`;

const E_204800 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 204800 */
  float val0 = (float((float(idx0)<float(int((51200)))))!=0.0?float(texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  int alu0 = (idx0*(int((-1))));
  float val1 = (float(bool(int((float(alu0)<float((int((-51199))))))*int((float(idx0)<float(int((102400)))))))!=0.0?float(texture(data2, vec2(float(float(int(idx0+(int((-51200))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(idx0+(int((-51200))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
  float val2 = (float(bool(int((float(alu0)<float((int((-102399))))))*int((float(idx0)<float(int((153600)))))))!=0.0?float(texture(data3, vec2(float(float(int(idx0+(int((-102400))))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(idx0+(int((-102400))))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):float((0.0)));
  float val3 = (float((float(alu0)<float((int((-153599))))))!=0.0?float(texture(data4, vec2(float(float(int(idx0+(int((-153600))))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(idx0+(int((-153600))))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r):float((0.0)));
  out_data = float((val0+val1+val2+val3));
}`;

const E_131072 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 131072 */
  float val0 = float(texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  out_data = float(float(val0));
}`;

const r_102400_128_4 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 102400 */
  float acc0 = float((0.0));
  int alu0 = (idx0/int((400)));
  float val0 = float(texture(data3, vec2(float(float(int(alu0)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu0)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val1 = float(texture(data4, vec2(float(float(int(alu0)%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu0)/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val2 = float(texture(data5, vec2(float(float(int(alu0)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu0)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val3 = float(texture(data6, vec2(float(float(int(alu0)%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu0)/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  for (int ridx0 = int((0)); ridx0 < int((128)); ridx0++) {
    int alu1 = ((ridx0*int((1600)))+(int(idx0)%int(int((400)))));
    float val4 = float(texture(data1, vec2(float(float(int(alu1)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val5 = float(texture(data1, vec2(float(float(int(alu1+int((400)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1+int((400)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val6 = float(texture(data1, vec2(float(float(int(alu1+int((800)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1+int((800)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val7 = float(texture(data1, vec2(float(float(int(alu1+int((1200)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1+int((1200)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    int alu2 = ((ridx0*int((4)))+(alu0*int((512))));
    float val8 = float(texture(data2, vec2(float(float(int(alu2)%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2)/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val9 = float(texture(data2, vec2(float(float(int(alu2+int((1)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((1)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val10 = float(texture(data2, vec2(float(float(int(alu2+int((2)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((2)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val11 = float(texture(data2, vec2(float(float(int(alu2+int((3)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((3)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val7*val11)+((val6*val10)+((val5*val9)+((val4*val8)+acc0))));
  }
  float alu3 = (((acc0-val0)*val1*float(sqrt((float((1.0))/(val2+float((0.001)))))))+val3);
  out_data = float((alu3*(float((1.0))/(float((1.0))+exp2((alu3*(float((-1.4426950408889634)))))))));
}`;

const E_409600n1 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 409600 */
  float val0 = float(texture(data1, vec2(float(float(int(idx0/int((4)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0/int((4)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  out_data = float(val0);
}`;

const E_614400 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 614400 */
  float val0 = (float((float(idx0)<float(int((409600)))))!=0.0?float(texture(data1, vec2(float(float(int((int(idx0)%int(int((2))))+((int((idx0/int((2))))%int(int((20))))*int((4)))+((int((idx0/int((40))))%int(int((2))))*int((2)))+((int((idx0/int((80))))%int(int((5120))))*int((80))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int((int(idx0)%int(int((2))))+((int((idx0/int((2))))%int(int((20))))*int((4)))+((int((idx0/int((40))))%int(int((2))))*int((2)))+((int((idx0/int((80))))%int(int((5120))))*int((80))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val1 = (float((float((idx0*(int((-1)))))<float((int((-409599))))))!=0.0?float(texture(data2, vec2(float(float(int(idx0+(int((-409600))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(idx0+(int((-409600))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
  out_data = float((val0+val1));
}`;

const E_49152 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 49152 */
  float val0 = float(texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  out_data = float(float(val0));
}`;

const r_204800_96_4 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 204800 */
  float acc0 = float((0.0));
  int alu0 = (idx0/int((1600)));
  float val0 = float(texture(data3, vec2(float(float(int(alu0)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu0)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val1 = float(texture(data4, vec2(float(float(int(alu0)%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu0)/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val2 = float(texture(data5, vec2(float(float(int(alu0)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu0)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val3 = float(texture(data6, vec2(float(float(int(alu0)%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu0)/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  for (int ridx0 = int((0)); ridx0 < int((96)); ridx0++) {
    int alu1 = ((ridx0*int((6400)))+(int(idx0)%int(int((1600)))));
    float val4 = float(texture(data1, vec2(float(float(int(alu1)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val5 = float(texture(data1, vec2(float(float(int(alu1+int((1600)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1+int((1600)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val6 = float(texture(data1, vec2(float(float(int(alu1+int((3200)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1+int((3200)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val7 = float(texture(data1, vec2(float(float(int(alu1+int((4800)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1+int((4800)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    int alu2 = ((ridx0*int((4)))+(alu0*int((384))));
    float val8 = float(texture(data2, vec2(float(float(int(alu2)%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2)/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val9 = float(texture(data2, vec2(float(float(int(alu2+int((1)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((1)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val10 = float(texture(data2, vec2(float(float(int(alu2+int((2)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((2)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val11 = float(texture(data2, vec2(float(float(int(alu2+int((3)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((3)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val7*val11)+((val6*val10)+((val5*val9)+((val4*val8)+acc0))));
  }
  float alu3 = (((acc0-val0)*val1*float(sqrt((float((1.0))/(val2+float((0.001)))))))+val3);
  out_data = float((alu3*(float((1.0))/(float((1.0))+exp2((alu3*(float((-1.4426950408889634)))))))));
}`;

const E_307200 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 307200 */
  int alu0 = (int(idx0)%int(int((204800))));
  bool alu1 = (float(idx0)<float(int((204800))));
  int alu2 = (int((idx0/int((1600))))%int(int((128))));
  float val0 = (float(bool(int(alu1)*int((float(alu2)<float(int((64)))))))!=0.0?float(texture(data1, vec2(float(float(int(alu0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val1 = (float(bool(int(alu1)*int((float((alu2*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data1, vec2(float(float(int(alu0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val2 = (float((float((idx0*(int((-1)))))<float((int((-204799))))))!=0.0?float(texture(data2, vec2(float(float(int(idx0+(int((-204800))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(idx0+(int((-204800))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
  out_data = float((val0+val1+val2));
}`;

const E_24576 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 24576 */
  float val0 = float(texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  out_data = float(float(val0));
}`;

const r_204800_48_4 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 204800 */
  float acc0 = float((0.0));
  int alu0 = (idx0/int((1600)));
  float val0 = float(texture(data3, vec2(float(float(int(alu0)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu0)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val1 = float(texture(data4, vec2(float(float(int(alu0)%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu0)/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val2 = float(texture(data5, vec2(float(float(int(alu0)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu0)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val3 = float(texture(data6, vec2(float(float(int(alu0)%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu0)/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  for (int ridx0 = int((0)); ridx0 < int((48)); ridx0++) {
    int alu1 = ((ridx0*int((6400)))+(int(idx0)%int(int((1600)))));
    float val4 = float(texture(data1, vec2(float(float(int(alu1)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val5 = float(texture(data1, vec2(float(float(int(alu1+int((1600)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1+int((1600)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val6 = float(texture(data1, vec2(float(float(int(alu1+int((3200)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1+int((3200)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val7 = float(texture(data1, vec2(float(float(int(alu1+int((4800)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1+int((4800)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    int alu2 = ((ridx0*int((4)))+(alu0*int((192))));
    float val8 = float(texture(data2, vec2(float(float(int(alu2)%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2)/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val9 = float(texture(data2, vec2(float(float(int(alu2+int((1)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((1)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val10 = float(texture(data2, vec2(float(float(int(alu2+int((2)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((2)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val11 = float(texture(data2, vec2(float(float(int(alu2+int((3)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((3)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val7*val11)+((val6*val10)+((val5*val9)+((val4*val8)+acc0))));
  }
  float alu3 = (((acc0-val0)*val1*float(sqrt((float((1.0))/(val2+float((0.001)))))))+val3);
  out_data = float((alu3*(float((1.0))/(float((1.0))+exp2((alu3*(float((-1.4426950408889634)))))))));
}`;

const E_819200n1 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 819200 */
  float val0 = float(texture(data1, vec2(float(float(int(idx0/int((4)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0/int((4)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  out_data = float(val0);
}`;

const E_1228800n2 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 1228800 */
  float val0 = (float((float(idx0)<float(int((819200)))))!=0.0?float(texture(data1, vec2(float(float(int((int(idx0)%int(int((2))))+((int((idx0/int((2))))%int(int((40))))*int((4)))+((int((idx0/int((80))))%int(int((2))))*int((2)))+((int((idx0/int((160))))%int(int((5120))))*int((160))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int((int(idx0)%int(int((2))))+((int((idx0/int((2))))%int(int((40))))*int((4)))+((int((idx0/int((80))))%int(int((2))))*int((2)))+((int((idx0/int((160))))%int(int((5120))))*int((160))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val1 = (float((float((idx0*(int((-1)))))<float((int((-819199))))))!=0.0?float(texture(data2, vec2(float(float(int(idx0+(int((-819200))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(idx0+(int((-819200))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
  out_data = float((val0+val1));
}`;

const E_12288 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 12288 */
  float val0 = float(texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  out_data = float(float(val0));
}`;

const r_409600_48_4 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 409600 */
  float acc0 = float((0.0));
  int alu0 = (idx0/int((6400)));
  float val0 = float(texture(data3, vec2(float(float(int(alu0)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu0)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val1 = float(texture(data4, vec2(float(float(int(alu0)%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu0)/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val2 = float(texture(data5, vec2(float(float(int(alu0)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu0)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val3 = float(texture(data6, vec2(float(float(int(alu0)%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu0)/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  for (int ridx0 = int((0)); ridx0 < int((48)); ridx0++) {
    int alu1 = ((ridx0*int((25600)))+(int(idx0)%int(int((6400)))));
    float val4 = float(texture(data1, vec2(float(float(int(alu1)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val5 = float(texture(data1, vec2(float(float(int(alu1+int((6400)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1+int((6400)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val6 = float(texture(data1, vec2(float(float(int(alu1+int((12800)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1+int((12800)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val7 = float(texture(data1, vec2(float(float(int(alu1+int((19200)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1+int((19200)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    int alu2 = ((ridx0*int((4)))+(alu0*int((192))));
    float val8 = float(texture(data2, vec2(float(float(int(alu2)%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2)/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val9 = float(texture(data2, vec2(float(float(int(alu2+int((1)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((1)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val10 = float(texture(data2, vec2(float(float(int(alu2+int((2)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((2)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val11 = float(texture(data2, vec2(float(float(int(alu2+int((3)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((3)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val7*val11)+((val6*val10)+((val5*val9)+((val4*val8)+acc0))));
  }
  float alu3 = (((acc0-val0)*val1*float(sqrt((float((1.0))/(val2+float((0.001)))))))+val3);
  out_data = float((alu3*(float((1.0))/(float((1.0))+exp2((alu3*(float((-1.4426950408889634)))))))));
}`;

const E_614400n1 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 614400 */
  int alu0 = (int(idx0)%int(int((409600))));
  bool alu1 = (float(idx0)<float(int((409600))));
  int alu2 = (int((idx0/int((6400))))%int(int((64))));
  float val0 = (float(bool(int(alu1)*int((float(alu2)<float(int((32)))))))!=0.0?float(texture(data1, vec2(float(float(int(alu0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val1 = (float(bool(int(alu1)*int((float((alu2*(int((-1)))))<float((int((-31))))))))!=0.0?float(texture(data1, vec2(float(float(int(alu0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val2 = (float((float((idx0*(int((-1)))))<float((int((-409599))))))!=0.0?float(texture(data2, vec2(float(float(int(idx0+(int((-409600))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(idx0+(int((-409600))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
  out_data = float((val0+val1+val2));
}`;

const E_6144 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 6144 */
  float val0 = float(texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  out_data = float(float(val0));
}`;

const r_409600_24_4 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 409600 */
  float acc0 = float((0.0));
  int alu0 = (idx0/int((6400)));
  float val0 = float(texture(data3, vec2(float(float(int(alu0)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu0)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val1 = float(texture(data4, vec2(float(float(int(alu0)%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu0)/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val2 = float(texture(data5, vec2(float(float(int(alu0)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu0)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val3 = float(texture(data6, vec2(float(float(int(alu0)%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu0)/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  for (int ridx0 = int((0)); ridx0 < int((24)); ridx0++) {
    int alu1 = ((ridx0*int((25600)))+(int(idx0)%int(int((6400)))));
    float val4 = float(texture(data1, vec2(float(float(int(alu1)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val5 = float(texture(data1, vec2(float(float(int(alu1+int((6400)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1+int((6400)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val6 = float(texture(data1, vec2(float(float(int(alu1+int((12800)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1+int((12800)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val7 = float(texture(data1, vec2(float(float(int(alu1+int((19200)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1+int((19200)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    int alu2 = ((ridx0*int((4)))+(alu0*int((96))));
    float val8 = float(texture(data2, vec2(float(float(int(alu2)%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2)/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val9 = float(texture(data2, vec2(float(float(int(alu2+int((1)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((1)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val10 = float(texture(data2, vec2(float(float(int(alu2+int((2)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((2)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val11 = float(texture(data2, vec2(float(float(int(alu2+int((3)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((3)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val7*val11)+((val6*val10)+((val5*val9)+((val4*val8)+acc0))));
  }
  float alu3 = (((acc0-val0)*val1*float(sqrt((float((1.0))/(val2+float((0.001)))))))+val3);
  out_data = float((alu3*(float((1.0))/(float((1.0))+exp2((alu3*(float((-1.4426950408889634)))))))));
}`;

const r_409600_64_3_3 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 409600 */
  float acc0 = float((0.0));
  int alu0 = (int(idx0)%int(int((80))));
  int alu1 = (int((idx0/int((80))))%int(int((80))));
  bool alu2 = (float((alu0*(int((-1)))))<float(int((0))));
  bool alu3 = (float((alu1*(int((-1)))))<float(int((0))));
  bool alu4 = (float(alu0)<float(int((79))));
  bool alu5 = (float(alu1)<float(int((79))));
  int alu6 = (idx0/int((6400)));
  float val0 = float(texture(data3, vec2(float(float(int(alu6)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu6)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val1 = float(texture(data4, vec2(float(float(int(alu6)%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu6)/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val2 = float(texture(data5, vec2(float(float(int(alu6)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu6)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val3 = float(texture(data6, vec2(float(float(int(alu6)%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu6)/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  for (int ridx0 = int((0)); ridx0 < int((64)); ridx0++) {
    int alu7 = (alu0+(alu1*int((80)))+(ridx0*int((6400))));
    float val4 = (float(bool(int(alu2)*int(alu3)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+(int((-81))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+(int((-81))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val5 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu7+(int((-80))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+(int((-80))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val6 = (float(bool(int(alu4)*int(alu3)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+(int((-79))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+(int((-79))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val7 = (float(alu2)!=0.0?float(texture(data1, vec2(float(float(int(alu7+(int((-1))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+(int((-1))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val8 = float(texture(data1, vec2(float(float(int(alu7)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val9 = (float(alu4)!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((1)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((1)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val10 = (float(bool(int(alu2)*int(alu5)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((79)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((79)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val11 = (float(alu5)!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((80)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((80)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val12 = (float(bool(int(alu4)*int(alu5)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((81)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((81)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    int alu8 = ((ridx0*int((9)))+(alu6*int((576))));
    float val13 = float(texture(data2, vec2(float(float(int(alu8)%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8)/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val14 = float(texture(data2, vec2(float(float(int(alu8+int((1)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((1)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val15 = float(texture(data2, vec2(float(float(int(alu8+int((2)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((2)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val16 = float(texture(data2, vec2(float(float(int(alu8+int((3)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((3)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val17 = float(texture(data2, vec2(float(float(int(alu8+int((4)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((4)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val18 = float(texture(data2, vec2(float(float(int(alu8+int((5)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((5)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val19 = float(texture(data2, vec2(float(float(int(alu8+int((6)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((6)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val20 = float(texture(data2, vec2(float(float(int(alu8+int((7)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((7)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val21 = float(texture(data2, vec2(float(float(int(alu8+int((8)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((8)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val12*val21)+((val11*val20)+((val10*val19)+((val9*val18)+((val8*val17)+((val7*val16)+((val6*val15)+((val5*val14)+((val4*val13)+acc0)))))))));
  }
  float alu9 = (((acc0-val0)*val1*float(sqrt((float((1.0))/(val2+float((0.001)))))))+val3);
  out_data = float((alu9*(float((1.0))/(float((1.0))+exp2((alu9*(float((-1.4426950408889634)))))))));
}`;

const r_409600_16_4n1 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 409600 */
  float acc0 = float((0.0));
  int alu0 = (idx0/int((6400)));
  float val0 = float(texture(data3, vec2(float(float(int(alu0)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu0)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  for (int ridx0 = int((0)); ridx0 < int((16)); ridx0++) {
    int alu1 = ((ridx0*int((25600)))+(int(idx0)%int(int((6400)))));
    float val1 = float(texture(data1, vec2(float(float(int(alu1)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val2 = float(texture(data1, vec2(float(float(int(alu1+int((6400)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1+int((6400)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val3 = float(texture(data1, vec2(float(float(int(alu1+int((12800)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1+int((12800)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val4 = float(texture(data1, vec2(float(float(int(alu1+int((19200)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1+int((19200)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    int alu2 = ((ridx0*int((4)))+(alu0*int((64))));
    float val5 = float(texture(data2, vec2(float(float(int(alu2)%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2)/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val6 = float(texture(data2, vec2(float(float(int(alu2+int((1)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((1)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val7 = float(texture(data2, vec2(float(float(int(alu2+int((2)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((2)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val8 = float(texture(data2, vec2(float(float(int(alu2+int((3)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((3)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val4*val8)+((val3*val7)+((val2*val6)+((val1*val5)+acc0))));
  }
  out_data = float((acc0+val0));
}`;

const E_46080 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 46080 */
  float val0 = float(texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  out_data = float(float(val0));
}`;

const E_80 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 80 */
  float val0 = float(texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  out_data = float(float(val0));
}`;

const r_512000_64_3_3 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 512000 */
  float acc0 = float((0.0));
  int alu0 = (int(idx0)%int(int((80))));
  int alu1 = (int((idx0/int((80))))%int(int((80))));
  bool alu2 = (float((alu0*(int((-1)))))<float(int((0))));
  bool alu3 = (float((alu1*(int((-1)))))<float(int((0))));
  bool alu4 = (float(alu0)<float(int((79))));
  bool alu5 = (float(alu1)<float(int((79))));
  int alu6 = (idx0/int((6400)));
  float val0 = float(texture(data3, vec2(float(float(int(alu6)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu6)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val1 = float(texture(data4, vec2(float(float(int(alu6)%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu6)/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val2 = float(texture(data5, vec2(float(float(int(alu6)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu6)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val3 = float(texture(data6, vec2(float(float(int(alu6)%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu6)/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  for (int ridx0 = int((0)); ridx0 < int((64)); ridx0++) {
    int alu7 = (alu0+(alu1*int((80)))+(ridx0*int((6400))));
    float val4 = (float(bool(int(alu2)*int(alu3)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+(int((-81))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+(int((-81))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val5 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu7+(int((-80))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+(int((-80))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val6 = (float(bool(int(alu4)*int(alu3)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+(int((-79))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+(int((-79))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val7 = (float(alu2)!=0.0?float(texture(data1, vec2(float(float(int(alu7+(int((-1))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+(int((-1))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val8 = float(texture(data1, vec2(float(float(int(alu7)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val9 = (float(alu4)!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((1)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((1)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val10 = (float(bool(int(alu2)*int(alu5)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((79)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((79)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val11 = (float(alu5)!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((80)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((80)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val12 = (float(bool(int(alu4)*int(alu5)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((81)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((81)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    int alu8 = ((ridx0*int((9)))+(alu6*int((576))));
    float val13 = float(texture(data2, vec2(float(float(int(alu8)%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8)/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val14 = float(texture(data2, vec2(float(float(int(alu8+int((1)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((1)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val15 = float(texture(data2, vec2(float(float(int(alu8+int((2)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((2)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val16 = float(texture(data2, vec2(float(float(int(alu8+int((3)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((3)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val17 = float(texture(data2, vec2(float(float(int(alu8+int((4)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((4)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val18 = float(texture(data2, vec2(float(float(int(alu8+int((5)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((5)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val19 = float(texture(data2, vec2(float(float(int(alu8+int((6)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((6)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val20 = float(texture(data2, vec2(float(float(int(alu8+int((7)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((7)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val21 = float(texture(data2, vec2(float(float(int(alu8+int((8)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((8)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val12*val21)+((val11*val20)+((val10*val19)+((val9*val18)+((val8*val17)+((val7*val16)+((val6*val15)+((val5*val14)+((val4*val13)+acc0)))))))));
  }
  float alu9 = (((acc0-val0)*val1*float(sqrt((float((1.0))/(val2+float((0.001)))))))+val3);
  out_data = float((alu9*(float((1.0))/(float((1.0))+exp2((alu9*(float((-1.4426950408889634)))))))));
}`;

const E_57600 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 57600 */
  float val0 = float(texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  out_data = float(float(val0));
}`;

const r_512000_80_3_3 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 512000 */
  float acc0 = float((0.0));
  int alu0 = (int(idx0)%int(int((80))));
  int alu1 = (int((idx0/int((80))))%int(int((80))));
  bool alu2 = (float((alu0*(int((-1)))))<float(int((0))));
  bool alu3 = (float((alu1*(int((-1)))))<float(int((0))));
  bool alu4 = (float(alu0)<float(int((79))));
  bool alu5 = (float(alu1)<float(int((79))));
  int alu6 = (idx0/int((6400)));
  float val0 = float(texture(data3, vec2(float(float(int(alu6)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu6)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val1 = float(texture(data4, vec2(float(float(int(alu6)%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu6)/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val2 = float(texture(data5, vec2(float(float(int(alu6)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu6)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val3 = float(texture(data6, vec2(float(float(int(alu6)%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu6)/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  for (int ridx0 = int((0)); ridx0 < int((80)); ridx0++) {
    int alu7 = (alu0+(alu1*int((80)))+(ridx0*int((6400))));
    float val4 = (float(bool(int(alu2)*int(alu3)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+(int((-81))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+(int((-81))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val5 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu7+(int((-80))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+(int((-80))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val6 = (float(bool(int(alu4)*int(alu3)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+(int((-79))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+(int((-79))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val7 = (float(alu2)!=0.0?float(texture(data1, vec2(float(float(int(alu7+(int((-1))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+(int((-1))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val8 = float(texture(data1, vec2(float(float(int(alu7)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val9 = (float(alu4)!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((1)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((1)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val10 = (float(bool(int(alu2)*int(alu5)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((79)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((79)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val11 = (float(alu5)!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((80)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((80)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val12 = (float(bool(int(alu4)*int(alu5)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((81)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((81)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    int alu8 = ((ridx0*int((9)))+(alu6*int((720))));
    float val13 = float(texture(data2, vec2(float(float(int(alu8)%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8)/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val14 = float(texture(data2, vec2(float(float(int(alu8+int((1)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((1)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val15 = float(texture(data2, vec2(float(float(int(alu8+int((2)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((2)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val16 = float(texture(data2, vec2(float(float(int(alu8+int((3)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((3)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val17 = float(texture(data2, vec2(float(float(int(alu8+int((4)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((4)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val18 = float(texture(data2, vec2(float(float(int(alu8+int((5)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((5)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val19 = float(texture(data2, vec2(float(float(int(alu8+int((6)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((6)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val20 = float(texture(data2, vec2(float(float(int(alu8+int((7)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((7)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val21 = float(texture(data2, vec2(float(float(int(alu8+int((8)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((8)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val12*val21)+((val11*val20)+((val10*val19)+((val9*val18)+((val8*val17)+((val7*val16)+((val6*val15)+((val5*val14)+((val4*val13)+acc0)))))))));
  }
  float alu9 = (((acc0-val0)*val1*float(sqrt((float((1.0))/(val2+float((0.001)))))))+val3);
  out_data = float((alu9*(float((1.0))/(float((1.0))+exp2((alu9*(float((-1.4426950408889634)))))))));
}`;

const E_6400 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 6400 */
  float val0 = float(texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  out_data = float(float(val0));
}`;

const r_512000_20_4 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 512000 */
  float acc0 = float((0.0));
  int alu0 = (idx0/int((6400)));
  float val0 = float(texture(data3, vec2(float(float(int(alu0)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu0)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  for (int ridx0 = int((0)); ridx0 < int((20)); ridx0++) {
    int alu1 = ((ridx0*int((25600)))+(int(idx0)%int(int((6400)))));
    float val1 = float(texture(data1, vec2(float(float(int(alu1)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val2 = float(texture(data1, vec2(float(float(int(alu1+int((6400)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1+int((6400)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val3 = float(texture(data1, vec2(float(float(int(alu1+int((12800)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1+int((12800)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val4 = float(texture(data1, vec2(float(float(int(alu1+int((19200)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1+int((19200)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    int alu2 = ((ridx0*int((4)))+(alu0*int((80))));
    float val5 = float(texture(data2, vec2(float(float(int(alu2)%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2)/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val6 = float(texture(data2, vec2(float(float(int(alu2+int((1)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((1)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val7 = float(texture(data2, vec2(float(float(int(alu2+int((2)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((2)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val8 = float(texture(data2, vec2(float(float(int(alu2+int((3)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((3)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val4*val8)+((val3*val7)+((val2*val6)+((val1*val5)+acc0))));
  }
  out_data = float((acc0+val0));
}`;

const r_102400_64_3_3n4 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 102400 */
  float acc0 = float((0.0));
  int alu0 = (int(idx0)%int(int((40))));
  int alu1 = (int((idx0/int((40))))%int(int((40))));
  bool alu2 = (float((alu0*(int((-1)))))<float(int((0))));
  bool alu3 = (float((alu1*(int((-1)))))<float(int((0))));
  int alu4 = (idx0/int((1600)));
  float val0 = float(texture(data3, vec2(float(float(int(alu4)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu4)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val1 = float(texture(data4, vec2(float(float(int(alu4)%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu4)/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val2 = float(texture(data5, vec2(float(float(int(alu4)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu4)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val3 = float(texture(data6, vec2(float(float(int(alu4)%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu4)/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  for (int ridx0 = int((0)); ridx0 < int((64)); ridx0++) {
    int alu5 = ((alu0*int((2)))+(alu1*int((160)))+(ridx0*int((6400))));
    float val4 = (float(bool(int(alu2)*int(alu3)))!=0.0?float(texture(data1, vec2(float(float(int(alu5+(int((-81))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5+(int((-81))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val5 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu5+(int((-80))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5+(int((-80))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val6 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu5+(int((-79))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5+(int((-79))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val7 = (float(alu2)!=0.0?float(texture(data1, vec2(float(float(int(alu5+(int((-1))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5+(int((-1))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val8 = float(texture(data1, vec2(float(float(int(alu5)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val9 = float(texture(data1, vec2(float(float(int(alu5+int((1)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5+int((1)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val10 = (float(alu2)!=0.0?float(texture(data1, vec2(float(float(int(alu5+int((79)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5+int((79)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val11 = float(texture(data1, vec2(float(float(int(alu5+int((80)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5+int((80)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val12 = float(texture(data1, vec2(float(float(int(alu5+int((81)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5+int((81)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    int alu6 = ((ridx0*int((9)))+(alu4*int((576))));
    float val13 = float(texture(data2, vec2(float(float(int(alu6)%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6)/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val14 = float(texture(data2, vec2(float(float(int(alu6+int((1)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6+int((1)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val15 = float(texture(data2, vec2(float(float(int(alu6+int((2)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6+int((2)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val16 = float(texture(data2, vec2(float(float(int(alu6+int((3)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6+int((3)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val17 = float(texture(data2, vec2(float(float(int(alu6+int((4)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6+int((4)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val18 = float(texture(data2, vec2(float(float(int(alu6+int((5)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6+int((5)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val19 = float(texture(data2, vec2(float(float(int(alu6+int((6)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6+int((6)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val20 = float(texture(data2, vec2(float(float(int(alu6+int((7)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6+int((7)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val21 = float(texture(data2, vec2(float(float(int(alu6+int((8)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6+int((8)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val12*val21)+((val11*val20)+((val10*val19)+((val9*val18)+((val8*val17)+((val7*val16)+((val6*val15)+((val5*val14)+((val4*val13)+acc0)))))))));
  }
  float alu7 = (((acc0-val0)*val1*float(sqrt((float((1.0))/(val2+float((0.001)))))))+val3);
  out_data = float((alu7*(float((1.0))/(float((1.0))+exp2((alu7*(float((-1.4426950408889634)))))))));
}`;

const E_307200n1 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 307200 */
  float val0 = (float((float(idx0)<float(int((102400)))))!=0.0?float(texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val1 = (float((float((idx0*(int((-1)))))<float((int((-102399))))))!=0.0?float(texture(data2, vec2(float(float(int(idx0+(int((-102400))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(idx0+(int((-102400))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
  out_data = float((val0+val1));
}`;

const E_73728n1 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 73728 */
  float val0 = float(texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  out_data = float(float(val0));
}`;

const r_102400_128_3_3n1 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 102400 */
  float acc0 = float((0.0));
  int alu0 = (int(idx0)%int(int((40))));
  int alu1 = (int((idx0/int((40))))%int(int((40))));
  bool alu2 = (float((alu0*(int((-1)))))<float(int((0))));
  bool alu3 = (float((alu1*(int((-1)))))<float(int((0))));
  bool alu4 = (float(alu0)<float(int((39))));
  bool alu5 = (float(alu1)<float(int((39))));
  int alu6 = (idx0/int((1600)));
  float val0 = float(texture(data3, vec2(float(float(int(alu6)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu6)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val1 = float(texture(data4, vec2(float(float(int(alu6)%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu6)/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val2 = float(texture(data5, vec2(float(float(int(alu6)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu6)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val3 = float(texture(data6, vec2(float(float(int(alu6)%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu6)/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  for (int ridx0 = int((0)); ridx0 < int((128)); ridx0++) {
    int alu7 = (alu0+(alu1*int((40)))+(ridx0*int((1600))));
    float val4 = (float(bool(int(alu2)*int(alu3)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+(int((-41))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+(int((-41))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val5 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu7+(int((-40))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+(int((-40))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val6 = (float(bool(int(alu4)*int(alu3)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+(int((-39))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+(int((-39))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val7 = (float(alu2)!=0.0?float(texture(data1, vec2(float(float(int(alu7+(int((-1))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+(int((-1))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val8 = float(texture(data1, vec2(float(float(int(alu7)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val9 = (float(alu4)!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((1)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((1)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val10 = (float(bool(int(alu2)*int(alu5)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((39)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((39)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val11 = (float(alu5)!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((40)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((40)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val12 = (float(bool(int(alu4)*int(alu5)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((41)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((41)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    int alu8 = ((ridx0*int((9)))+(alu6*int((1152))));
    float val13 = float(texture(data2, vec2(float(float(int(alu8)%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8)/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val14 = float(texture(data2, vec2(float(float(int(alu8+int((1)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((1)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val15 = float(texture(data2, vec2(float(float(int(alu8+int((2)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((2)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val16 = float(texture(data2, vec2(float(float(int(alu8+int((3)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((3)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val17 = float(texture(data2, vec2(float(float(int(alu8+int((4)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((4)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val18 = float(texture(data2, vec2(float(float(int(alu8+int((5)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((5)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val19 = float(texture(data2, vec2(float(float(int(alu8+int((6)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((6)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val20 = float(texture(data2, vec2(float(float(int(alu8+int((7)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((7)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val21 = float(texture(data2, vec2(float(float(int(alu8+int((8)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((8)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val12*val21)+((val11*val20)+((val10*val19)+((val9*val18)+((val8*val17)+((val7*val16)+((val6*val15)+((val5*val14)+((val4*val13)+acc0)))))))));
  }
  float alu9 = (((acc0-val0)*val1*float(sqrt((float((1.0))/(val2+float((0.001)))))))+val3);
  out_data = float((alu9*(float((1.0))/(float((1.0))+exp2((alu9*(float((-1.4426950408889634)))))))));
}`;

const r_102400_16_4 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 102400 */
  float acc0 = float((0.0));
  int alu0 = (idx0/int((1600)));
  float val0 = float(texture(data3, vec2(float(float(int(alu0)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu0)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  for (int ridx0 = int((0)); ridx0 < int((16)); ridx0++) {
    int alu1 = ((ridx0*int((6400)))+(int(idx0)%int(int((1600)))));
    float val1 = float(texture(data1, vec2(float(float(int(alu1)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val2 = float(texture(data1, vec2(float(float(int(alu1+int((1600)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1+int((1600)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val3 = float(texture(data1, vec2(float(float(int(alu1+int((3200)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1+int((3200)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val4 = float(texture(data1, vec2(float(float(int(alu1+int((4800)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1+int((4800)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    int alu2 = ((ridx0*int((4)))+(alu0*int((64))));
    float val5 = float(texture(data2, vec2(float(float(int(alu2)%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2)/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val6 = float(texture(data2, vec2(float(float(int(alu2+int((1)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((1)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val7 = float(texture(data2, vec2(float(float(int(alu2+int((2)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((2)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val8 = float(texture(data2, vec2(float(float(int(alu2+int((3)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((3)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val4*val8)+((val3*val7)+((val2*val6)+((val1*val5)+acc0))));
  }
  out_data = float((acc0+val0));
}`;

const E_92160 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 92160 */
  float val0 = float(texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  out_data = float(float(val0));
}`;

const r_128000_128_3_3 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 128000 */
  float acc0 = float((0.0));
  int alu0 = (int(idx0)%int(int((40))));
  int alu1 = (int((idx0/int((40))))%int(int((40))));
  bool alu2 = (float((alu0*(int((-1)))))<float(int((0))));
  bool alu3 = (float((alu1*(int((-1)))))<float(int((0))));
  bool alu4 = (float(alu0)<float(int((39))));
  bool alu5 = (float(alu1)<float(int((39))));
  int alu6 = (idx0/int((1600)));
  float val0 = float(texture(data3, vec2(float(float(int(alu6)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu6)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val1 = float(texture(data4, vec2(float(float(int(alu6)%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu6)/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val2 = float(texture(data5, vec2(float(float(int(alu6)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu6)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val3 = float(texture(data6, vec2(float(float(int(alu6)%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu6)/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  for (int ridx0 = int((0)); ridx0 < int((128)); ridx0++) {
    int alu7 = (alu0+(alu1*int((40)))+(ridx0*int((1600))));
    float val4 = (float(bool(int(alu2)*int(alu3)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+(int((-41))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+(int((-41))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val5 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu7+(int((-40))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+(int((-40))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val6 = (float(bool(int(alu4)*int(alu3)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+(int((-39))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+(int((-39))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val7 = (float(alu2)!=0.0?float(texture(data1, vec2(float(float(int(alu7+(int((-1))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+(int((-1))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val8 = float(texture(data1, vec2(float(float(int(alu7)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val9 = (float(alu4)!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((1)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((1)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val10 = (float(bool(int(alu2)*int(alu5)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((39)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((39)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val11 = (float(alu5)!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((40)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((40)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val12 = (float(bool(int(alu4)*int(alu5)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((41)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((41)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    int alu8 = ((ridx0*int((9)))+(alu6*int((1152))));
    float val13 = float(texture(data2, vec2(float(float(int(alu8)%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8)/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val14 = float(texture(data2, vec2(float(float(int(alu8+int((1)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((1)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val15 = float(texture(data2, vec2(float(float(int(alu8+int((2)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((2)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val16 = float(texture(data2, vec2(float(float(int(alu8+int((3)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((3)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val17 = float(texture(data2, vec2(float(float(int(alu8+int((4)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((4)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val18 = float(texture(data2, vec2(float(float(int(alu8+int((5)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((5)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val19 = float(texture(data2, vec2(float(float(int(alu8+int((6)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((6)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val20 = float(texture(data2, vec2(float(float(int(alu8+int((7)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((7)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val21 = float(texture(data2, vec2(float(float(int(alu8+int((8)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((8)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val12*val21)+((val11*val20)+((val10*val19)+((val9*val18)+((val8*val17)+((val7*val16)+((val6*val15)+((val5*val14)+((val4*val13)+acc0)))))))));
  }
  float alu9 = (((acc0-val0)*val1*float(sqrt((float((1.0))/(val2+float((0.001)))))))+val3);
  out_data = float((alu9*(float((1.0))/(float((1.0))+exp2((alu9*(float((-1.4426950408889634)))))))));
}`;

const r_128000_80_3_3 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 128000 */
  float acc0 = float((0.0));
  int alu0 = (int(idx0)%int(int((40))));
  int alu1 = (int((idx0/int((40))))%int(int((40))));
  bool alu2 = (float((alu0*(int((-1)))))<float(int((0))));
  bool alu3 = (float((alu1*(int((-1)))))<float(int((0))));
  bool alu4 = (float(alu0)<float(int((39))));
  bool alu5 = (float(alu1)<float(int((39))));
  int alu6 = (idx0/int((1600)));
  float val0 = float(texture(data3, vec2(float(float(int(alu6)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu6)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val1 = float(texture(data4, vec2(float(float(int(alu6)%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu6)/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val2 = float(texture(data5, vec2(float(float(int(alu6)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu6)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val3 = float(texture(data6, vec2(float(float(int(alu6)%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu6)/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  for (int ridx0 = int((0)); ridx0 < int((80)); ridx0++) {
    int alu7 = (alu0+(alu1*int((40)))+(ridx0*int((1600))));
    float val4 = (float(bool(int(alu2)*int(alu3)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+(int((-41))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+(int((-41))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val5 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu7+(int((-40))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+(int((-40))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val6 = (float(bool(int(alu4)*int(alu3)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+(int((-39))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+(int((-39))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val7 = (float(alu2)!=0.0?float(texture(data1, vec2(float(float(int(alu7+(int((-1))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+(int((-1))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val8 = float(texture(data1, vec2(float(float(int(alu7)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val9 = (float(alu4)!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((1)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((1)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val10 = (float(bool(int(alu2)*int(alu5)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((39)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((39)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val11 = (float(alu5)!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((40)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((40)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val12 = (float(bool(int(alu4)*int(alu5)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((41)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((41)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    int alu8 = ((ridx0*int((9)))+(alu6*int((720))));
    float val13 = float(texture(data2, vec2(float(float(int(alu8)%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8)/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val14 = float(texture(data2, vec2(float(float(int(alu8+int((1)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((1)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val15 = float(texture(data2, vec2(float(float(int(alu8+int((2)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((2)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val16 = float(texture(data2, vec2(float(float(int(alu8+int((3)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((3)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val17 = float(texture(data2, vec2(float(float(int(alu8+int((4)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((4)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val18 = float(texture(data2, vec2(float(float(int(alu8+int((5)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((5)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val19 = float(texture(data2, vec2(float(float(int(alu8+int((6)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((6)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val20 = float(texture(data2, vec2(float(float(int(alu8+int((7)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((7)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val21 = float(texture(data2, vec2(float(float(int(alu8+int((8)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((8)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val12*val21)+((val11*val20)+((val10*val19)+((val9*val18)+((val8*val17)+((val7*val16)+((val6*val15)+((val5*val14)+((val4*val13)+acc0)))))))));
  }
  float alu9 = (((acc0-val0)*val1*float(sqrt((float((1.0))/(val2+float((0.001)))))))+val3);
  out_data = float((alu9*(float((1.0))/(float((1.0))+exp2((alu9*(float((-1.4426950408889634)))))))));
}`;

const r_128000_20_4 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 128000 */
  float acc0 = float((0.0));
  int alu0 = (idx0/int((1600)));
  float val0 = float(texture(data3, vec2(float(float(int(alu0)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu0)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  for (int ridx0 = int((0)); ridx0 < int((20)); ridx0++) {
    int alu1 = ((ridx0*int((6400)))+(int(idx0)%int(int((1600)))));
    float val1 = float(texture(data1, vec2(float(float(int(alu1)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val2 = float(texture(data1, vec2(float(float(int(alu1+int((1600)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1+int((1600)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val3 = float(texture(data1, vec2(float(float(int(alu1+int((3200)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1+int((3200)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val4 = float(texture(data1, vec2(float(float(int(alu1+int((4800)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1+int((4800)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    int alu2 = ((ridx0*int((4)))+(alu0*int((80))));
    float val5 = float(texture(data2, vec2(float(float(int(alu2)%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2)/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val6 = float(texture(data2, vec2(float(float(int(alu2+int((1)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((1)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val7 = float(texture(data2, vec2(float(float(int(alu2+int((2)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((2)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val8 = float(texture(data2, vec2(float(float(int(alu2+int((3)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((3)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val4*val8)+((val3*val7)+((val2*val6)+((val1*val5)+acc0))));
  }
  out_data = float((acc0+val0));
}`;

const r_51200_128_3_3n2 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 51200 */
  float acc0 = float((0.0));
  int alu0 = (int(idx0)%int(int((20))));
  int alu1 = (int((idx0/int((20))))%int(int((20))));
  bool alu2 = (float((alu0*(int((-1)))))<float(int((0))));
  bool alu3 = (float((alu1*(int((-1)))))<float(int((0))));
  int alu4 = (idx0/int((400)));
  float val0 = float(texture(data3, vec2(float(float(int(alu4)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu4)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val1 = float(texture(data4, vec2(float(float(int(alu4)%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu4)/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val2 = float(texture(data5, vec2(float(float(int(alu4)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu4)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val3 = float(texture(data6, vec2(float(float(int(alu4)%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu4)/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  for (int ridx0 = int((0)); ridx0 < int((128)); ridx0++) {
    int alu5 = ((alu0*int((2)))+(alu1*int((80)))+(ridx0*int((1600))));
    float val4 = (float(bool(int(alu2)*int(alu3)))!=0.0?float(texture(data1, vec2(float(float(int(alu5+(int((-41))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5+(int((-41))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val5 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu5+(int((-40))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5+(int((-40))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val6 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu5+(int((-39))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5+(int((-39))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val7 = (float(alu2)!=0.0?float(texture(data1, vec2(float(float(int(alu5+(int((-1))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5+(int((-1))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val8 = float(texture(data1, vec2(float(float(int(alu5)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val9 = float(texture(data1, vec2(float(float(int(alu5+int((1)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5+int((1)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val10 = (float(alu2)!=0.0?float(texture(data1, vec2(float(float(int(alu5+int((39)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5+int((39)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val11 = float(texture(data1, vec2(float(float(int(alu5+int((40)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5+int((40)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val12 = float(texture(data1, vec2(float(float(int(alu5+int((41)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu5+int((41)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    int alu6 = ((ridx0*int((9)))+(alu4*int((1152))));
    float val13 = float(texture(data2, vec2(float(float(int(alu6)%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6)/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val14 = float(texture(data2, vec2(float(float(int(alu6+int((1)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6+int((1)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val15 = float(texture(data2, vec2(float(float(int(alu6+int((2)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6+int((2)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val16 = float(texture(data2, vec2(float(float(int(alu6+int((3)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6+int((3)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val17 = float(texture(data2, vec2(float(float(int(alu6+int((4)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6+int((4)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val18 = float(texture(data2, vec2(float(float(int(alu6+int((5)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6+int((5)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val19 = float(texture(data2, vec2(float(float(int(alu6+int((6)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6+int((6)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val20 = float(texture(data2, vec2(float(float(int(alu6+int((7)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6+int((7)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val21 = float(texture(data2, vec2(float(float(int(alu6+int((8)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu6+int((8)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val12*val21)+((val11*val20)+((val10*val19)+((val9*val18)+((val8*val17)+((val7*val16)+((val6*val15)+((val5*val14)+((val4*val13)+acc0)))))))));
  }
  float alu7 = (((acc0-val0)*val1*float(sqrt((float((1.0))/(val2+float((0.001)))))))+val3);
  out_data = float((alu7*(float((1.0))/(float((1.0))+exp2((alu7*(float((-1.4426950408889634)))))))));
}`;

const E_153600n1 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 153600 */
  float val0 = (float((float(idx0)<float(int((51200)))))!=0.0?float(texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val1 = (float((float((idx0*(int((-1)))))<float((int((-51199))))))!=0.0?float(texture(data2, vec2(float(float(int(idx0+(int((-51200))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(idx0+(int((-51200))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
  out_data = float((val0+val1));
}`;

const r_51200_128_3_3n3 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 51200 */
  float acc0 = float((0.0));
  int alu0 = (int(idx0)%int(int((20))));
  int alu1 = (int((idx0/int((20))))%int(int((20))));
  bool alu2 = (float((alu0*(int((-1)))))<float(int((0))));
  bool alu3 = (float((alu1*(int((-1)))))<float(int((0))));
  bool alu4 = (float(alu0)<float(int((19))));
  bool alu5 = (float(alu1)<float(int((19))));
  int alu6 = (idx0/int((400)));
  float val0 = float(texture(data3, vec2(float(float(int(alu6)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu6)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val1 = float(texture(data4, vec2(float(float(int(alu6)%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu6)/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val2 = float(texture(data5, vec2(float(float(int(alu6)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu6)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val3 = float(texture(data6, vec2(float(float(int(alu6)%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu6)/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  for (int ridx0 = int((0)); ridx0 < int((128)); ridx0++) {
    int alu7 = (alu0+(alu1*int((20)))+(ridx0*int((400))));
    float val4 = (float(bool(int(alu2)*int(alu3)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+(int((-21))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+(int((-21))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val5 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu7+(int((-20))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+(int((-20))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val6 = (float(bool(int(alu4)*int(alu3)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+(int((-19))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+(int((-19))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val7 = (float(alu2)!=0.0?float(texture(data1, vec2(float(float(int(alu7+(int((-1))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+(int((-1))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val8 = float(texture(data1, vec2(float(float(int(alu7)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val9 = (float(alu4)!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((1)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((1)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val10 = (float(bool(int(alu2)*int(alu5)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((19)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((19)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val11 = (float(alu5)!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((20)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((20)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val12 = (float(bool(int(alu4)*int(alu5)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((21)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((21)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    int alu8 = ((ridx0*int((9)))+(alu6*int((1152))));
    float val13 = float(texture(data2, vec2(float(float(int(alu8)%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8)/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val14 = float(texture(data2, vec2(float(float(int(alu8+int((1)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((1)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val15 = float(texture(data2, vec2(float(float(int(alu8+int((2)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((2)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val16 = float(texture(data2, vec2(float(float(int(alu8+int((3)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((3)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val17 = float(texture(data2, vec2(float(float(int(alu8+int((4)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((4)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val18 = float(texture(data2, vec2(float(float(int(alu8+int((5)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((5)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val19 = float(texture(data2, vec2(float(float(int(alu8+int((6)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((6)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val20 = float(texture(data2, vec2(float(float(int(alu8+int((7)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((7)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val21 = float(texture(data2, vec2(float(float(int(alu8+int((8)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((8)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val12*val21)+((val11*val20)+((val10*val19)+((val9*val18)+((val8*val17)+((val7*val16)+((val6*val15)+((val5*val14)+((val4*val13)+acc0)))))))));
  }
  float alu9 = (((acc0-val0)*val1*float(sqrt((float((1.0))/(val2+float((0.001)))))))+val3);
  out_data = float((alu9*(float((1.0))/(float((1.0))+exp2((alu9*(float((-1.4426950408889634)))))))));
}`;

const E_147456n1 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 147456 */
  float val0 = float(texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  out_data = float(float(val0));
}`;

const r_25600_256_3_3 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 25600 */
  float acc0 = float((0.0));
  int alu0 = (int(idx0)%int(int((20))));
  int alu1 = (int((idx0/int((20))))%int(int((20))));
  bool alu2 = (float((alu0*(int((-1)))))<float(int((0))));
  bool alu3 = (float((alu1*(int((-1)))))<float(int((0))));
  bool alu4 = (float(alu0)<float(int((19))));
  bool alu5 = (float(alu1)<float(int((19))));
  int alu6 = (idx0/int((400)));
  float val0 = float(texture(data3, vec2(float(float(int(alu6)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu6)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val1 = float(texture(data4, vec2(float(float(int(alu6)%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu6)/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val2 = float(texture(data5, vec2(float(float(int(alu6)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu6)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val3 = float(texture(data6, vec2(float(float(int(alu6)%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu6)/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  for (int ridx0 = int((0)); ridx0 < int((256)); ridx0++) {
    int alu7 = (alu0+(alu1*int((20)))+(ridx0*int((400))));
    float val4 = (float(bool(int(alu2)*int(alu3)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+(int((-21))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+(int((-21))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val5 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu7+(int((-20))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+(int((-20))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val6 = (float(bool(int(alu4)*int(alu3)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+(int((-19))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+(int((-19))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val7 = (float(alu2)!=0.0?float(texture(data1, vec2(float(float(int(alu7+(int((-1))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+(int((-1))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val8 = float(texture(data1, vec2(float(float(int(alu7)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val9 = (float(alu4)!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((1)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((1)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val10 = (float(bool(int(alu2)*int(alu5)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((19)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((19)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val11 = (float(alu5)!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((20)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((20)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val12 = (float(bool(int(alu4)*int(alu5)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((21)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((21)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    int alu8 = ((ridx0*int((9)))+(alu6*int((2304))));
    float val13 = float(texture(data2, vec2(float(float(int(alu8)%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8)/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val14 = float(texture(data2, vec2(float(float(int(alu8+int((1)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((1)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val15 = float(texture(data2, vec2(float(float(int(alu8+int((2)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((2)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val16 = float(texture(data2, vec2(float(float(int(alu8+int((3)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((3)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val17 = float(texture(data2, vec2(float(float(int(alu8+int((4)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((4)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val18 = float(texture(data2, vec2(float(float(int(alu8+int((5)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((5)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val19 = float(texture(data2, vec2(float(float(int(alu8+int((6)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((6)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val20 = float(texture(data2, vec2(float(float(int(alu8+int((7)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((7)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val21 = float(texture(data2, vec2(float(float(int(alu8+int((8)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((8)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val12*val21)+((val11*val20)+((val10*val19)+((val9*val18)+((val8*val17)+((val7*val16)+((val6*val15)+((val5*val14)+((val4*val13)+acc0)))))))));
  }
  float alu9 = (((acc0-val0)*val1*float(sqrt((float((1.0))/(val2+float((0.001)))))))+val3);
  out_data = float((alu9*(float((1.0))/(float((1.0))+exp2((alu9*(float((-1.4426950408889634)))))))));
}`;

const r_25600_64_3_3 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 25600 */
  float acc0 = float((0.0));
  int alu0 = (int(idx0)%int(int((20))));
  int alu1 = (int((idx0/int((20))))%int(int((20))));
  bool alu2 = (float((alu0*(int((-1)))))<float(int((0))));
  bool alu3 = (float((alu1*(int((-1)))))<float(int((0))));
  bool alu4 = (float(alu0)<float(int((19))));
  bool alu5 = (float(alu1)<float(int((19))));
  int alu6 = (idx0/int((400)));
  float val0 = float(texture(data3, vec2(float(float(int(alu6)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu6)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val1 = float(texture(data4, vec2(float(float(int(alu6)%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu6)/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val2 = float(texture(data5, vec2(float(float(int(alu6)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu6)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val3 = float(texture(data6, vec2(float(float(int(alu6)%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu6)/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  for (int ridx0 = int((0)); ridx0 < int((64)); ridx0++) {
    int alu7 = (alu0+(alu1*int((20)))+(ridx0*int((400))));
    float val4 = (float(bool(int(alu2)*int(alu3)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+(int((-21))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+(int((-21))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val5 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu7+(int((-20))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+(int((-20))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val6 = (float(bool(int(alu4)*int(alu3)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+(int((-19))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+(int((-19))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val7 = (float(alu2)!=0.0?float(texture(data1, vec2(float(float(int(alu7+(int((-1))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+(int((-1))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val8 = float(texture(data1, vec2(float(float(int(alu7)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val9 = (float(alu4)!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((1)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((1)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val10 = (float(bool(int(alu2)*int(alu5)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((19)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((19)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val11 = (float(alu5)!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((20)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((20)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val12 = (float(bool(int(alu4)*int(alu5)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((21)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((21)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    int alu8 = ((ridx0*int((9)))+(alu6*int((576))));
    float val13 = float(texture(data2, vec2(float(float(int(alu8)%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8)/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val14 = float(texture(data2, vec2(float(float(int(alu8+int((1)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((1)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val15 = float(texture(data2, vec2(float(float(int(alu8+int((2)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((2)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val16 = float(texture(data2, vec2(float(float(int(alu8+int((3)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((3)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val17 = float(texture(data2, vec2(float(float(int(alu8+int((4)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((4)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val18 = float(texture(data2, vec2(float(float(int(alu8+int((5)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((5)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val19 = float(texture(data2, vec2(float(float(int(alu8+int((6)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((6)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val20 = float(texture(data2, vec2(float(float(int(alu8+int((7)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((7)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val21 = float(texture(data2, vec2(float(float(int(alu8+int((8)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((8)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val12*val21)+((val11*val20)+((val10*val19)+((val9*val18)+((val8*val17)+((val7*val16)+((val6*val15)+((val5*val14)+((val4*val13)+acc0)))))))));
  }
  float alu9 = (((acc0-val0)*val1*float(sqrt((float((1.0))/(val2+float((0.001)))))))+val3);
  out_data = float((alu9*(float((1.0))/(float((1.0))+exp2((alu9*(float((-1.4426950408889634)))))))));
}`;

const r_25600_16_4 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 25600 */
  float acc0 = float((0.0));
  int alu0 = (idx0/int((400)));
  float val0 = float(texture(data3, vec2(float(float(int(alu0)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu0)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  for (int ridx0 = int((0)); ridx0 < int((16)); ridx0++) {
    int alu1 = ((ridx0*int((1600)))+(int(idx0)%int(int((400)))));
    float val1 = float(texture(data1, vec2(float(float(int(alu1)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val2 = float(texture(data1, vec2(float(float(int(alu1+int((400)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1+int((400)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val3 = float(texture(data1, vec2(float(float(int(alu1+int((800)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1+int((800)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val4 = float(texture(data1, vec2(float(float(int(alu1+int((1200)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1+int((1200)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    int alu2 = ((ridx0*int((4)))+(alu0*int((64))));
    float val5 = float(texture(data2, vec2(float(float(int(alu2)%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2)/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val6 = float(texture(data2, vec2(float(float(int(alu2+int((1)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((1)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val7 = float(texture(data2, vec2(float(float(int(alu2+int((2)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((2)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val8 = float(texture(data2, vec2(float(float(int(alu2+int((3)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((3)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val4*val8)+((val3*val7)+((val2*val6)+((val1*val5)+acc0))));
  }
  out_data = float((acc0+val0));
}`;

const E_184320 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 184320 */
  float val0 = float(texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  out_data = float(float(val0));
}`;

const r_32000_256_3_3 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 32000 */
  float acc0 = float((0.0));
  int alu0 = (int(idx0)%int(int((20))));
  int alu1 = (int((idx0/int((20))))%int(int((20))));
  bool alu2 = (float((alu0*(int((-1)))))<float(int((0))));
  bool alu3 = (float((alu1*(int((-1)))))<float(int((0))));
  bool alu4 = (float(alu0)<float(int((19))));
  bool alu5 = (float(alu1)<float(int((19))));
  int alu6 = (idx0/int((400)));
  float val0 = float(texture(data3, vec2(float(float(int(alu6)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu6)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val1 = float(texture(data4, vec2(float(float(int(alu6)%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu6)/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val2 = float(texture(data5, vec2(float(float(int(alu6)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu6)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val3 = float(texture(data6, vec2(float(float(int(alu6)%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu6)/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  for (int ridx0 = int((0)); ridx0 < int((256)); ridx0++) {
    int alu7 = (alu0+(alu1*int((20)))+(ridx0*int((400))));
    float val4 = (float(bool(int(alu2)*int(alu3)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+(int((-21))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+(int((-21))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val5 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu7+(int((-20))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+(int((-20))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val6 = (float(bool(int(alu4)*int(alu3)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+(int((-19))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+(int((-19))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val7 = (float(alu2)!=0.0?float(texture(data1, vec2(float(float(int(alu7+(int((-1))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+(int((-1))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val8 = float(texture(data1, vec2(float(float(int(alu7)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val9 = (float(alu4)!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((1)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((1)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val10 = (float(bool(int(alu2)*int(alu5)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((19)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((19)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val11 = (float(alu5)!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((20)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((20)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val12 = (float(bool(int(alu4)*int(alu5)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((21)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((21)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    int alu8 = ((ridx0*int((9)))+(alu6*int((2304))));
    float val13 = float(texture(data2, vec2(float(float(int(alu8)%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8)/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val14 = float(texture(data2, vec2(float(float(int(alu8+int((1)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((1)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val15 = float(texture(data2, vec2(float(float(int(alu8+int((2)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((2)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val16 = float(texture(data2, vec2(float(float(int(alu8+int((3)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((3)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val17 = float(texture(data2, vec2(float(float(int(alu8+int((4)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((4)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val18 = float(texture(data2, vec2(float(float(int(alu8+int((5)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((5)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val19 = float(texture(data2, vec2(float(float(int(alu8+int((6)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((6)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val20 = float(texture(data2, vec2(float(float(int(alu8+int((7)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((7)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val21 = float(texture(data2, vec2(float(float(int(alu8+int((8)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((8)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val12*val21)+((val11*val20)+((val10*val19)+((val9*val18)+((val8*val17)+((val7*val16)+((val6*val15)+((val5*val14)+((val4*val13)+acc0)))))))));
  }
  float alu9 = (((acc0-val0)*val1*float(sqrt((float((1.0))/(val2+float((0.001)))))))+val3);
  out_data = float((alu9*(float((1.0))/(float((1.0))+exp2((alu9*(float((-1.4426950408889634)))))))));
}`;

const r_32000_80_3_3 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 32000 */
  float acc0 = float((0.0));
  int alu0 = (int(idx0)%int(int((20))));
  int alu1 = (int((idx0/int((20))))%int(int((20))));
  bool alu2 = (float((alu0*(int((-1)))))<float(int((0))));
  bool alu3 = (float((alu1*(int((-1)))))<float(int((0))));
  bool alu4 = (float(alu0)<float(int((19))));
  bool alu5 = (float(alu1)<float(int((19))));
  int alu6 = (idx0/int((400)));
  float val0 = float(texture(data3, vec2(float(float(int(alu6)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu6)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  float val1 = float(texture(data4, vec2(float(float(int(alu6)%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu6)/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r);
  float val2 = float(texture(data5, vec2(float(float(int(alu6)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu6)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r);
  float val3 = float(texture(data6, vec2(float(float(int(alu6)%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu6)/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r);
  for (int ridx0 = int((0)); ridx0 < int((80)); ridx0++) {
    int alu7 = (alu0+(alu1*int((20)))+(ridx0*int((400))));
    float val4 = (float(bool(int(alu2)*int(alu3)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+(int((-21))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+(int((-21))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val5 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu7+(int((-20))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+(int((-20))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val6 = (float(bool(int(alu4)*int(alu3)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+(int((-19))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+(int((-19))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val7 = (float(alu2)!=0.0?float(texture(data1, vec2(float(float(int(alu7+(int((-1))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+(int((-1))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val8 = float(texture(data1, vec2(float(float(int(alu7)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val9 = (float(alu4)!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((1)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((1)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val10 = (float(bool(int(alu2)*int(alu5)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((19)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((19)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val11 = (float(alu5)!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((20)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((20)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    float val12 = (float(bool(int(alu4)*int(alu5)))!=0.0?float(texture(data1, vec2(float(float(int(alu7+int((21)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu7+int((21)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
    int alu8 = ((ridx0*int((9)))+(alu6*int((720))));
    float val13 = float(texture(data2, vec2(float(float(int(alu8)%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8)/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val14 = float(texture(data2, vec2(float(float(int(alu8+int((1)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((1)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val15 = float(texture(data2, vec2(float(float(int(alu8+int((2)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((2)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val16 = float(texture(data2, vec2(float(float(int(alu8+int((3)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((3)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val17 = float(texture(data2, vec2(float(float(int(alu8+int((4)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((4)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val18 = float(texture(data2, vec2(float(float(int(alu8+int((5)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((5)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val19 = float(texture(data2, vec2(float(float(int(alu8+int((6)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((6)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val20 = float(texture(data2, vec2(float(float(int(alu8+int((7)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((7)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val21 = float(texture(data2, vec2(float(float(int(alu8+int((8)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu8+int((8)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val12*val21)+((val11*val20)+((val10*val19)+((val9*val18)+((val8*val17)+((val7*val16)+((val6*val15)+((val5*val14)+((val4*val13)+acc0)))))))));
  }
  float alu9 = (((acc0-val0)*val1*float(sqrt((float((1.0))/(val2+float((0.001)))))))+val3);
  out_data = float((alu9*(float((1.0))/(float((1.0))+exp2((alu9*(float((-1.4426950408889634)))))))));
}`;

const r_32000_20_4 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 32000 */
  float acc0 = float((0.0));
  int alu0 = (idx0/int((400)));
  float val0 = float(texture(data3, vec2(float(float(int(alu0)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu0)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  for (int ridx0 = int((0)); ridx0 < int((20)); ridx0++) {
    int alu1 = ((ridx0*int((1600)))+(int(idx0)%int(int((400)))));
    float val1 = float(texture(data1, vec2(float(float(int(alu1)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val2 = float(texture(data1, vec2(float(float(int(alu1+int((400)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1+int((400)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val3 = float(texture(data1, vec2(float(float(int(alu1+int((800)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1+int((800)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    float val4 = float(texture(data1, vec2(float(float(int(alu1+int((1200)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu1+int((1200)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
    int alu2 = ((ridx0*int((4)))+(alu0*int((80))));
    float val5 = float(texture(data2, vec2(float(float(int(alu2)%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2)/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val6 = float(texture(data2, vec2(float(float(int(alu2+int((1)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((1)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val7 = float(texture(data2, vec2(float(float(int(alu2+int((2)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((2)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    float val8 = float(texture(data2, vec2(float(float(int(alu2+int((3)))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+int((3)))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r);
    acc0 = ((val4*val8)+((val3*val7)+((val2*val6)+((val1*val5)+acc0))));
  }
  out_data = float((acc0+val0));
}`;

const r_33600_16 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 33600 */
  float acc0 = -(1./0.);
  int alu0 = (int(idx0)%int(int((8400))));
  int alu1 = (idx0/int((8400)));
  int alu2 = (alu0+(alu1*int((102400))));
  bool alu3 = (float(alu0)<float(int((6400))));
  float val0 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu2)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu2)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val1 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu2+int((6400)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu2+int((6400)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val2 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu2+int((12800)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu2+int((12800)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val3 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu2+int((19200)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu2+int((19200)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val4 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu2+int((25600)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu2+int((25600)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val5 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu2+int((32000)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu2+int((32000)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val6 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu2+int((38400)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu2+int((38400)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val7 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu2+int((44800)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu2+int((44800)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val8 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu2+int((51200)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu2+int((51200)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val9 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu2+int((57600)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu2+int((57600)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val10 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu2+int((64000)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu2+int((64000)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val11 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu2+int((70400)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu2+int((70400)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val12 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu2+int((76800)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu2+int((76800)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val13 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu2+int((83200)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu2+int((83200)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val14 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu2+int((89600)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu2+int((89600)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  int alu4 = (alu1*int((16)));
  int alu5 = (alu0/int((6400)));
  float val15 = (float(bool(int(alu3)*int((float((alu4+alu5))<float(int((49)))))))!=0.0?float(texture(data1, vec2(float(float(int(alu2+int((96000)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu2+int((96000)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  int alu6 = (alu1*(int((-16))));
  float val16 = (float(bool(int(alu3)*int((float((alu6+(alu5*(int((-1))))))<float((int((-48))))))))!=0.0?float(texture(data2, vec2(float(float(int(alu2+(int((-313600))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+(int((-313600))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
  int alu7 = (alu0+(alu1*int((25600))));
  int alu8 = (int((alu7+int((224000))))%int(int((230400))));
  int alu9 = (alu0*(int((-1))));
  bool alu10 = bool(int((float(alu9)<float((int((-6399))))))*int((float(alu0)<float(int((8000))))));
  int alu11 = (alu0/int((1600)));
  int alu12 = (alu4+alu11);
  int alu13 = (int((alu12+int((140))))%int(int((144))));
  float val17 = (float(bool(int(alu10)*int((float(alu13)<float(int((64)))))))!=0.0?float(texture(data3, vec2(float(float(int(alu8)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu8)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):float((0.0)));
  int alu14 = (int((alu7+int((225600))))%int(int((230400))));
  int alu15 = (int((alu12+int((141))))%int(int((144))));
  float val18 = (float(bool(int(alu10)*int((float(alu15)<float(int((64)))))))!=0.0?float(texture(data3, vec2(float(float(int(alu14)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu14)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):float((0.0)));
  int alu16 = (int((alu7+int((227200))))%int(int((230400))));
  int alu17 = (int((alu12+int((142))))%int(int((144))));
  float val19 = (float(bool(int(alu10)*int((float(alu17)<float(int((64)))))))!=0.0?float(texture(data3, vec2(float(float(int(alu16)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu16)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):float((0.0)));
  int alu18 = (int((alu7+int((228800))))%int(int((230400))));
  int alu19 = (int((alu12+int((143))))%int(int((144))));
  float val20 = (float(bool(int(alu10)*int((float(alu19)<float(int((64)))))))!=0.0?float(texture(data3, vec2(float(float(int(alu18)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu18)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):float((0.0)));
  float val21 = (float(alu10)!=0.0?float(texture(data3, vec2(float(float(int(alu7)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu7)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):float((0.0)));
  float val22 = (float(alu10)!=0.0?float(texture(data3, vec2(float(float(int(alu7+int((1600)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu7+int((1600)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):float((0.0)));
  float val23 = (float(alu10)!=0.0?float(texture(data3, vec2(float(float(int(alu7+int((3200)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu7+int((3200)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):float((0.0)));
  float val24 = (float(alu10)!=0.0?float(texture(data3, vec2(float(float(int(alu7+int((4800)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu7+int((4800)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):float((0.0)));
  float val25 = (float(alu10)!=0.0?float(texture(data3, vec2(float(float(int(alu7+int((6400)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu7+int((6400)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):float((0.0)));
  float val26 = (float(alu10)!=0.0?float(texture(data3, vec2(float(float(int(alu7+int((8000)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu7+int((8000)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):float((0.0)));
  float val27 = (float(alu10)!=0.0?float(texture(data3, vec2(float(float(int(alu7+int((9600)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu7+int((9600)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):float((0.0)));
  float val28 = (float(alu10)!=0.0?float(texture(data3, vec2(float(float(int(alu7+int((11200)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu7+int((11200)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):float((0.0)));
  float val29 = (float(alu10)!=0.0?float(texture(data3, vec2(float(float(int(alu7+int((12800)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu7+int((12800)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):float((0.0)));
  float val30 = (float(alu10)!=0.0?float(texture(data3, vec2(float(float(int(alu7+int((14400)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu7+int((14400)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):float((0.0)));
  float val31 = (float(alu10)!=0.0?float(texture(data3, vec2(float(float(int(alu7+int((16000)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu7+int((16000)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):float((0.0)));
  float val32 = (float(bool(int(alu10)*int((float(alu12)<float(int((53)))))))!=0.0?float(texture(data3, vec2(float(float(int(alu7+int((17600)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu7+int((17600)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):float((0.0)));
  float val33 = (float(bool(int(alu10)*int((float((alu13*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data4, vec2(float(float(int(alu8+(int((-102400))))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu8+(int((-102400))))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r):float((0.0)));
  float val34 = (float(bool(int(alu10)*int((float((alu15*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data4, vec2(float(float(int(alu14+(int((-102400))))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu14+(int((-102400))))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r):float((0.0)));
  float val35 = (float(bool(int(alu10)*int((float((alu17*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data4, vec2(float(float(int(alu16+(int((-102400))))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu16+(int((-102400))))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r):float((0.0)));
  float val36 = (float(bool(int(alu10)*int((float((alu19*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data4, vec2(float(float(int(alu18+(int((-102400))))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu18+(int((-102400))))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r):float((0.0)));
  float val37 = (float(bool(int(alu10)*int((float((alu6+(alu11*(int((-1))))))<float((int((-52))))))))!=0.0?float(texture(data4, vec2(float(float(int(alu7+(int((-84800))))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu7+(int((-84800))))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r):float((0.0)));
  int alu20 = (alu0+(alu1*int((6400))));
  int alu21 = (int((alu20+int((49600))))%int(int((57600))));
  bool alu22 = (float(alu9)<float((int((-7999)))));
  int alu23 = (alu4+(int((idx0/int((400))))%int(int((21)))));
  int alu24 = (int((alu23+int((124))))%int(int((144))));
  float val38 = (float(bool(int(alu22)*int((float(alu24)<float(int((64)))))))!=0.0?float(texture(data5, vec2(float(float(int(alu21)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu21)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r):float((0.0)));
  int alu25 = (int((alu20+int((50000))))%int(int((57600))));
  int alu26 = (int((alu23+int((125))))%int(int((144))));
  float val39 = (float(bool(int(alu22)*int((float(alu26)<float(int((64)))))))!=0.0?float(texture(data5, vec2(float(float(int(alu25)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu25)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r):float((0.0)));
  int alu27 = (int((alu20+int((50400))))%int(int((57600))));
  int alu28 = (int((alu23+int((126))))%int(int((144))));
  float val40 = (float(bool(int(alu22)*int((float(alu28)<float(int((64)))))))!=0.0?float(texture(data5, vec2(float(float(int(alu27)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu27)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r):float((0.0)));
  int alu29 = (int((alu20+int((50800))))%int(int((57600))));
  int alu30 = (int((alu23+int((127))))%int(int((144))));
  float val41 = (float(bool(int(alu22)*int((float(alu30)<float(int((64)))))))!=0.0?float(texture(data5, vec2(float(float(int(alu29)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu29)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r):float((0.0)));
  int alu31 = (int((alu20+int((51200))))%int(int((57600))));
  int alu32 = (int((alu23+int((128))))%int(int((144))));
  float val42 = (float(bool(int(alu22)*int((float(alu32)<float(int((64)))))))!=0.0?float(texture(data5, vec2(float(float(int(alu31)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu31)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r):float((0.0)));
  int alu33 = (int((alu20+int((51600))))%int(int((57600))));
  int alu34 = (int((alu23+int((129))))%int(int((144))));
  float val43 = (float(bool(int(alu22)*int((float(alu34)<float(int((64)))))))!=0.0?float(texture(data5, vec2(float(float(int(alu33)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu33)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r):float((0.0)));
  int alu35 = (int((alu20+int((52000))))%int(int((57600))));
  int alu36 = (int((alu23+int((130))))%int(int((144))));
  float val44 = (float(bool(int(alu22)*int((float(alu36)<float(int((64)))))))!=0.0?float(texture(data5, vec2(float(float(int(alu35)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu35)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r):float((0.0)));
  int alu37 = (int((alu20+int((52400))))%int(int((57600))));
  int alu38 = (int((alu23+int((131))))%int(int((144))));
  float val45 = (float(bool(int(alu22)*int((float(alu38)<float(int((64)))))))!=0.0?float(texture(data5, vec2(float(float(int(alu37)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu37)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r):float((0.0)));
  int alu39 = (int((alu20+int((52800))))%int(int((57600))));
  int alu40 = (int((alu23+int((132))))%int(int((144))));
  float val46 = (float(bool(int(alu22)*int((float(alu40)<float(int((64)))))))!=0.0?float(texture(data5, vec2(float(float(int(alu39)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu39)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r):float((0.0)));
  int alu41 = (int((alu20+int((53200))))%int(int((57600))));
  int alu42 = (int((alu23+int((133))))%int(int((144))));
  float val47 = (float(bool(int(alu22)*int((float(alu42)<float(int((64)))))))!=0.0?float(texture(data5, vec2(float(float(int(alu41)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu41)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r):float((0.0)));
  int alu43 = (int((alu20+int((53600))))%int(int((57600))));
  int alu44 = (int((alu23+int((134))))%int(int((144))));
  float val48 = (float(bool(int(alu22)*int((float(alu44)<float(int((64)))))))!=0.0?float(texture(data5, vec2(float(float(int(alu43)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu43)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r):float((0.0)));
  int alu45 = (int((alu20+int((54000))))%int(int((57600))));
  int alu46 = (int((alu23+int((135))))%int(int((144))));
  float val49 = (float(bool(int(alu22)*int((float(alu46)<float(int((64)))))))!=0.0?float(texture(data5, vec2(float(float(int(alu45)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu45)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r):float((0.0)));
  int alu47 = (int((alu20+int((54400))))%int(int((57600))));
  int alu48 = (int((alu23+int((136))))%int(int((144))));
  float val50 = (float(bool(int(alu22)*int((float(alu48)<float(int((64)))))))!=0.0?float(texture(data5, vec2(float(float(int(alu47)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu47)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r):float((0.0)));
  int alu49 = (int((alu20+int((54800))))%int(int((57600))));
  int alu50 = (int((alu23+int((137))))%int(int((144))));
  float val51 = (float(bool(int(alu22)*int((float(alu50)<float(int((64)))))))!=0.0?float(texture(data5, vec2(float(float(int(alu49)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu49)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r):float((0.0)));
  int alu51 = (int((alu20+int((55200))))%int(int((57600))));
  int alu52 = (int((alu23+int((138))))%int(int((144))));
  float val52 = (float(bool(int(alu22)*int((float(alu52)<float(int((64)))))))!=0.0?float(texture(data5, vec2(float(float(int(alu51)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu51)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r):float((0.0)));
  int alu53 = (int((alu20+int((55600))))%int(int((57600))));
  int alu54 = (int((alu23+int((139))))%int(int((144))));
  float val53 = (float(bool(int(alu22)*int((float(alu54)<float(int((64)))))))!=0.0?float(texture(data5, vec2(float(float(int(alu53)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu53)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r):float((0.0)));
  float val54 = (float(bool(int(alu22)*int((float((alu24*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data6, vec2(float(float(int(alu21+(int((-25600))))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu21+(int((-25600))))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r):float((0.0)));
  float val55 = (float(bool(int(alu22)*int((float((alu26*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data6, vec2(float(float(int(alu25+(int((-25600))))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu25+(int((-25600))))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r):float((0.0)));
  float val56 = (float(bool(int(alu22)*int((float((alu28*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data6, vec2(float(float(int(alu27+(int((-25600))))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu27+(int((-25600))))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r):float((0.0)));
  float val57 = (float(bool(int(alu22)*int((float((alu30*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data6, vec2(float(float(int(alu29+(int((-25600))))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu29+(int((-25600))))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r):float((0.0)));
  float val58 = (float(bool(int(alu22)*int((float((alu32*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data6, vec2(float(float(int(alu31+(int((-25600))))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu31+(int((-25600))))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r):float((0.0)));
  float val59 = (float(bool(int(alu22)*int((float((alu34*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data6, vec2(float(float(int(alu33+(int((-25600))))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu33+(int((-25600))))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r):float((0.0)));
  float val60 = (float(bool(int(alu22)*int((float((alu36*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data6, vec2(float(float(int(alu35+(int((-25600))))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu35+(int((-25600))))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r):float((0.0)));
  float val61 = (float(bool(int(alu22)*int((float((alu38*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data6, vec2(float(float(int(alu37+(int((-25600))))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu37+(int((-25600))))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r):float((0.0)));
  float val62 = (float(bool(int(alu22)*int((float((alu40*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data6, vec2(float(float(int(alu39+(int((-25600))))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu39+(int((-25600))))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r):float((0.0)));
  float val63 = (float(bool(int(alu22)*int((float((alu42*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data6, vec2(float(float(int(alu41+(int((-25600))))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu41+(int((-25600))))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r):float((0.0)));
  float val64 = (float(bool(int(alu22)*int((float((alu44*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data6, vec2(float(float(int(alu43+(int((-25600))))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu43+(int((-25600))))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r):float((0.0)));
  float val65 = (float(bool(int(alu22)*int((float((alu46*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data6, vec2(float(float(int(alu45+(int((-25600))))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu45+(int((-25600))))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r):float((0.0)));
  float val66 = (float(bool(int(alu22)*int((float((alu48*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data6, vec2(float(float(int(alu47+(int((-25600))))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu47+(int((-25600))))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r):float((0.0)));
  float val67 = (float(bool(int(alu22)*int((float((alu50*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data6, vec2(float(float(int(alu49+(int((-25600))))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu49+(int((-25600))))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r):float((0.0)));
  float val68 = (float(bool(int(alu22)*int((float((alu52*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data6, vec2(float(float(int(alu51+(int((-25600))))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu51+(int((-25600))))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r):float((0.0)));
  float val69 = (float(bool(int(alu22)*int((float((alu54*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data6, vec2(float(float(int(alu53+(int((-25600))))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu53+(int((-25600))))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r):float((0.0)));
  float alu55 = max((val0+(val17+val33)+(val38+val54)),acc0);
  float alu56 = max((val1+(val18+val34)+(val39+val55)),alu55);
  float alu57 = max((val2+(val19+val35)+(val40+val56)),alu56);
  float alu58 = max((val3+(val20+val36)+(val41+val57)),alu57);
  float alu59 = max((val4+val21+(val42+val58)),alu58);
  float alu60 = max((val5+val22+(val43+val59)),alu59);
  float alu61 = max((val6+val23+(val44+val60)),alu60);
  float alu62 = max((val7+val24+(val45+val61)),alu61);
  float alu63 = max((val8+val25+(val46+val62)),alu62);
  float alu64 = max((val9+val26+(val47+val63)),alu63);
  float alu65 = max((val10+val27+(val48+val64)),alu64);
  float alu66 = max((val11+val28+(val49+val65)),alu65);
  float alu67 = max((val12+val29+(val50+val66)),alu66);
  float alu68 = max((val13+val30+(val51+val67)),alu67);
  float alu69 = max((val14+val31+(val52+val68)),alu68);
  float alu70 = max((val15+val16+(val32+val37)+(val53+val69)),alu69);
  out_data = float(alu70);
}`;

const r_33600_16n1 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
uniform sampler2D data7;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 33600 */
  float acc0 = float((0.0));
  int alu0 = (int(idx0)%int(int((8400))));
  int alu1 = (idx0/int((8400)));
  int alu2 = (alu0+(alu1*int((102400))));
  bool alu3 = (float(alu0)<float(int((6400))));
  float val0 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu2)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu2)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val1 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu2+int((6400)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu2+int((6400)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val2 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu2+int((12800)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu2+int((12800)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val3 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu2+int((19200)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu2+int((19200)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val4 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu2+int((25600)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu2+int((25600)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val5 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu2+int((32000)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu2+int((32000)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val6 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu2+int((38400)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu2+int((38400)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val7 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu2+int((44800)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu2+int((44800)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val8 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu2+int((51200)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu2+int((51200)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val9 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu2+int((57600)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu2+int((57600)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val10 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu2+int((64000)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu2+int((64000)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val11 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu2+int((70400)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu2+int((70400)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val12 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu2+int((76800)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu2+int((76800)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val13 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu2+int((83200)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu2+int((83200)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val14 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu2+int((89600)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu2+int((89600)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  int alu4 = (alu1*int((16)));
  int alu5 = (alu0/int((6400)));
  float val15 = (float(bool(int(alu3)*int((float((alu4+alu5))<float(int((49)))))))!=0.0?float(texture(data1, vec2(float(float(int(alu2+int((96000)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu2+int((96000)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  int alu6 = (alu1*(int((-16))));
  float val16 = (float(bool(int(alu3)*int((float((alu6+(alu5*(int((-1))))))<float((int((-48))))))))!=0.0?float(texture(data2, vec2(float(float(int(alu2+(int((-313600))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+(int((-313600))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
  int alu7 = (alu0+(alu1*int((25600))));
  int alu8 = (int((alu7+int((224000))))%int(int((230400))));
  int alu9 = (alu0*(int((-1))));
  bool alu10 = bool(int((float(alu9)<float((int((-6399))))))*int((float(alu0)<float(int((8000))))));
  int alu11 = (alu0/int((1600)));
  int alu12 = (alu4+alu11);
  int alu13 = (int((alu12+int((140))))%int(int((144))));
  float val17 = (float(bool(int(alu10)*int((float(alu13)<float(int((64)))))))!=0.0?float(texture(data3, vec2(float(float(int(alu8)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu8)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):float((0.0)));
  int alu14 = (int((alu7+int((225600))))%int(int((230400))));
  int alu15 = (int((alu12+int((141))))%int(int((144))));
  float val18 = (float(bool(int(alu10)*int((float(alu15)<float(int((64)))))))!=0.0?float(texture(data3, vec2(float(float(int(alu14)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu14)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):float((0.0)));
  int alu16 = (int((alu7+int((227200))))%int(int((230400))));
  int alu17 = (int((alu12+int((142))))%int(int((144))));
  float val19 = (float(bool(int(alu10)*int((float(alu17)<float(int((64)))))))!=0.0?float(texture(data3, vec2(float(float(int(alu16)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu16)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):float((0.0)));
  int alu18 = (int((alu7+int((228800))))%int(int((230400))));
  int alu19 = (int((alu12+int((143))))%int(int((144))));
  float val20 = (float(bool(int(alu10)*int((float(alu19)<float(int((64)))))))!=0.0?float(texture(data3, vec2(float(float(int(alu18)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu18)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):float((0.0)));
  float val21 = (float(alu10)!=0.0?float(texture(data3, vec2(float(float(int(alu7)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu7)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):float((0.0)));
  float val22 = (float(alu10)!=0.0?float(texture(data3, vec2(float(float(int(alu7+int((1600)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu7+int((1600)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):float((0.0)));
  float val23 = (float(alu10)!=0.0?float(texture(data3, vec2(float(float(int(alu7+int((3200)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu7+int((3200)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):float((0.0)));
  float val24 = (float(alu10)!=0.0?float(texture(data3, vec2(float(float(int(alu7+int((4800)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu7+int((4800)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):float((0.0)));
  float val25 = (float(alu10)!=0.0?float(texture(data3, vec2(float(float(int(alu7+int((6400)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu7+int((6400)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):float((0.0)));
  float val26 = (float(alu10)!=0.0?float(texture(data3, vec2(float(float(int(alu7+int((8000)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu7+int((8000)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):float((0.0)));
  float val27 = (float(alu10)!=0.0?float(texture(data3, vec2(float(float(int(alu7+int((9600)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu7+int((9600)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):float((0.0)));
  float val28 = (float(alu10)!=0.0?float(texture(data3, vec2(float(float(int(alu7+int((11200)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu7+int((11200)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):float((0.0)));
  float val29 = (float(alu10)!=0.0?float(texture(data3, vec2(float(float(int(alu7+int((12800)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu7+int((12800)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):float((0.0)));
  float val30 = (float(alu10)!=0.0?float(texture(data3, vec2(float(float(int(alu7+int((14400)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu7+int((14400)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):float((0.0)));
  float val31 = (float(alu10)!=0.0?float(texture(data3, vec2(float(float(int(alu7+int((16000)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu7+int((16000)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):float((0.0)));
  float val32 = (float(bool(int(alu10)*int((float(alu12)<float(int((53)))))))!=0.0?float(texture(data3, vec2(float(float(int(alu7+int((17600)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu7+int((17600)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):float((0.0)));
  float val33 = (float(bool(int(alu10)*int((float((alu13*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data4, vec2(float(float(int(alu8+(int((-102400))))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu8+(int((-102400))))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r):float((0.0)));
  float val34 = (float(bool(int(alu10)*int((float((alu15*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data4, vec2(float(float(int(alu14+(int((-102400))))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu14+(int((-102400))))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r):float((0.0)));
  float val35 = (float(bool(int(alu10)*int((float((alu17*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data4, vec2(float(float(int(alu16+(int((-102400))))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu16+(int((-102400))))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r):float((0.0)));
  float val36 = (float(bool(int(alu10)*int((float((alu19*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data4, vec2(float(float(int(alu18+(int((-102400))))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu18+(int((-102400))))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r):float((0.0)));
  float val37 = (float(bool(int(alu10)*int((float((alu6+(alu11*(int((-1))))))<float((int((-52))))))))!=0.0?float(texture(data4, vec2(float(float(int(alu7+(int((-84800))))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu7+(int((-84800))))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r):float((0.0)));
  int alu20 = (alu0+(alu1*int((6400))));
  int alu21 = (int((alu20+int((49600))))%int(int((57600))));
  bool alu22 = (float(alu9)<float((int((-7999)))));
  int alu23 = (alu4+(int((idx0/int((400))))%int(int((21)))));
  int alu24 = (int((alu23+int((124))))%int(int((144))));
  float val38 = (float(bool(int(alu22)*int((float(alu24)<float(int((64)))))))!=0.0?float(texture(data5, vec2(float(float(int(alu21)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu21)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r):float((0.0)));
  int alu25 = (int((alu20+int((50000))))%int(int((57600))));
  int alu26 = (int((alu23+int((125))))%int(int((144))));
  float val39 = (float(bool(int(alu22)*int((float(alu26)<float(int((64)))))))!=0.0?float(texture(data5, vec2(float(float(int(alu25)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu25)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r):float((0.0)));
  int alu27 = (int((alu20+int((50400))))%int(int((57600))));
  int alu28 = (int((alu23+int((126))))%int(int((144))));
  float val40 = (float(bool(int(alu22)*int((float(alu28)<float(int((64)))))))!=0.0?float(texture(data5, vec2(float(float(int(alu27)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu27)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r):float((0.0)));
  int alu29 = (int((alu20+int((50800))))%int(int((57600))));
  int alu30 = (int((alu23+int((127))))%int(int((144))));
  float val41 = (float(bool(int(alu22)*int((float(alu30)<float(int((64)))))))!=0.0?float(texture(data5, vec2(float(float(int(alu29)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu29)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r):float((0.0)));
  int alu31 = (int((alu20+int((51200))))%int(int((57600))));
  int alu32 = (int((alu23+int((128))))%int(int((144))));
  float val42 = (float(bool(int(alu22)*int((float(alu32)<float(int((64)))))))!=0.0?float(texture(data5, vec2(float(float(int(alu31)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu31)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r):float((0.0)));
  int alu33 = (int((alu20+int((51600))))%int(int((57600))));
  int alu34 = (int((alu23+int((129))))%int(int((144))));
  float val43 = (float(bool(int(alu22)*int((float(alu34)<float(int((64)))))))!=0.0?float(texture(data5, vec2(float(float(int(alu33)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu33)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r):float((0.0)));
  int alu35 = (int((alu20+int((52000))))%int(int((57600))));
  int alu36 = (int((alu23+int((130))))%int(int((144))));
  float val44 = (float(bool(int(alu22)*int((float(alu36)<float(int((64)))))))!=0.0?float(texture(data5, vec2(float(float(int(alu35)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu35)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r):float((0.0)));
  int alu37 = (int((alu20+int((52400))))%int(int((57600))));
  int alu38 = (int((alu23+int((131))))%int(int((144))));
  float val45 = (float(bool(int(alu22)*int((float(alu38)<float(int((64)))))))!=0.0?float(texture(data5, vec2(float(float(int(alu37)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu37)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r):float((0.0)));
  int alu39 = (int((alu20+int((52800))))%int(int((57600))));
  int alu40 = (int((alu23+int((132))))%int(int((144))));
  float val46 = (float(bool(int(alu22)*int((float(alu40)<float(int((64)))))))!=0.0?float(texture(data5, vec2(float(float(int(alu39)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu39)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r):float((0.0)));
  int alu41 = (int((alu20+int((53200))))%int(int((57600))));
  int alu42 = (int((alu23+int((133))))%int(int((144))));
  float val47 = (float(bool(int(alu22)*int((float(alu42)<float(int((64)))))))!=0.0?float(texture(data5, vec2(float(float(int(alu41)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu41)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r):float((0.0)));
  int alu43 = (int((alu20+int((53600))))%int(int((57600))));
  int alu44 = (int((alu23+int((134))))%int(int((144))));
  float val48 = (float(bool(int(alu22)*int((float(alu44)<float(int((64)))))))!=0.0?float(texture(data5, vec2(float(float(int(alu43)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu43)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r):float((0.0)));
  int alu45 = (int((alu20+int((54000))))%int(int((57600))));
  int alu46 = (int((alu23+int((135))))%int(int((144))));
  float val49 = (float(bool(int(alu22)*int((float(alu46)<float(int((64)))))))!=0.0?float(texture(data5, vec2(float(float(int(alu45)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu45)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r):float((0.0)));
  int alu47 = (int((alu20+int((54400))))%int(int((57600))));
  int alu48 = (int((alu23+int((136))))%int(int((144))));
  float val50 = (float(bool(int(alu22)*int((float(alu48)<float(int((64)))))))!=0.0?float(texture(data5, vec2(float(float(int(alu47)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu47)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r):float((0.0)));
  int alu49 = (int((alu20+int((54800))))%int(int((57600))));
  int alu50 = (int((alu23+int((137))))%int(int((144))));
  float val51 = (float(bool(int(alu22)*int((float(alu50)<float(int((64)))))))!=0.0?float(texture(data5, vec2(float(float(int(alu49)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu49)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r):float((0.0)));
  int alu51 = (int((alu20+int((55200))))%int(int((57600))));
  int alu52 = (int((alu23+int((138))))%int(int((144))));
  float val52 = (float(bool(int(alu22)*int((float(alu52)<float(int((64)))))))!=0.0?float(texture(data5, vec2(float(float(int(alu51)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu51)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r):float((0.0)));
  int alu53 = (int((alu20+int((55600))))%int(int((57600))));
  int alu54 = (int((alu23+int((139))))%int(int((144))));
  float val53 = (float(bool(int(alu22)*int((float(alu54)<float(int((64)))))))!=0.0?float(texture(data5, vec2(float(float(int(alu53)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu53)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r):float((0.0)));
  float val54 = (float(bool(int(alu22)*int((float((alu24*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data6, vec2(float(float(int(alu21+(int((-25600))))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu21+(int((-25600))))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r):float((0.0)));
  float val55 = (float(bool(int(alu22)*int((float((alu26*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data6, vec2(float(float(int(alu25+(int((-25600))))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu25+(int((-25600))))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r):float((0.0)));
  float val56 = (float(bool(int(alu22)*int((float((alu28*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data6, vec2(float(float(int(alu27+(int((-25600))))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu27+(int((-25600))))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r):float((0.0)));
  float val57 = (float(bool(int(alu22)*int((float((alu30*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data6, vec2(float(float(int(alu29+(int((-25600))))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu29+(int((-25600))))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r):float((0.0)));
  float val58 = (float(bool(int(alu22)*int((float((alu32*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data6, vec2(float(float(int(alu31+(int((-25600))))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu31+(int((-25600))))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r):float((0.0)));
  float val59 = (float(bool(int(alu22)*int((float((alu34*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data6, vec2(float(float(int(alu33+(int((-25600))))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu33+(int((-25600))))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r):float((0.0)));
  float val60 = (float(bool(int(alu22)*int((float((alu36*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data6, vec2(float(float(int(alu35+(int((-25600))))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu35+(int((-25600))))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r):float((0.0)));
  float val61 = (float(bool(int(alu22)*int((float((alu38*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data6, vec2(float(float(int(alu37+(int((-25600))))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu37+(int((-25600))))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r):float((0.0)));
  float val62 = (float(bool(int(alu22)*int((float((alu40*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data6, vec2(float(float(int(alu39+(int((-25600))))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu39+(int((-25600))))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r):float((0.0)));
  float val63 = (float(bool(int(alu22)*int((float((alu42*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data6, vec2(float(float(int(alu41+(int((-25600))))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu41+(int((-25600))))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r):float((0.0)));
  float val64 = (float(bool(int(alu22)*int((float((alu44*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data6, vec2(float(float(int(alu43+(int((-25600))))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu43+(int((-25600))))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r):float((0.0)));
  float val65 = (float(bool(int(alu22)*int((float((alu46*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data6, vec2(float(float(int(alu45+(int((-25600))))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu45+(int((-25600))))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r):float((0.0)));
  float val66 = (float(bool(int(alu22)*int((float((alu48*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data6, vec2(float(float(int(alu47+(int((-25600))))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu47+(int((-25600))))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r):float((0.0)));
  float val67 = (float(bool(int(alu22)*int((float((alu50*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data6, vec2(float(float(int(alu49+(int((-25600))))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu49+(int((-25600))))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r):float((0.0)));
  float val68 = (float(bool(int(alu22)*int((float((alu52*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data6, vec2(float(float(int(alu51+(int((-25600))))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu51+(int((-25600))))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r):float((0.0)));
  float val69 = (float(bool(int(alu22)*int((float((alu54*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data6, vec2(float(float(int(alu53+(int((-25600))))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu53+(int((-25600))))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r):float((0.0)));
  float val70 = float(texture(data7, vec2(float(float(int(idx0)%textureSize(data7, 0).x) + 0.5f)/float(textureSize(data7, 0).x), float(float(int(idx0)/textureSize(data7, 0).x) + 0.5f)/float(textureSize(data7, 0).y))).r);
  out_data = float((exp2((((val15+val16+(val32+val37)+(val53+val69))-val70)*float((1.4426950408889634))))+(exp2((((val14+val31+(val52+val68))-val70)*float((1.4426950408889634))))+(exp2((((val13+val30+(val51+val67))-val70)*float((1.4426950408889634))))+(exp2((((val12+val29+(val50+val66))-val70)*float((1.4426950408889634))))+(exp2((((val11+val28+(val49+val65))-val70)*float((1.4426950408889634))))+(exp2((((val10+val27+(val48+val64))-val70)*float((1.4426950408889634))))+(exp2((((val9+val26+(val47+val63))-val70)*float((1.4426950408889634))))+(exp2((((val8+val25+(val46+val62))-val70)*float((1.4426950408889634))))+(exp2((((val7+val24+(val45+val61))-val70)*float((1.4426950408889634))))+(exp2((((val6+val23+(val44+val60))-val70)*float((1.4426950408889634))))+(exp2((((val5+val22+(val43+val59))-val70)*float((1.4426950408889634))))+(exp2((((val4+val21+(val42+val58))-val70)*float((1.4426950408889634))))+(exp2((((val3+(val20+val36)+(val41+val57))-val70)*float((1.4426950408889634))))+(exp2((((val2+(val19+val35)+(val40+val56))-val70)*float((1.4426950408889634))))+(exp2((((val1+(val18+val34)+(val39+val55))-val70)*float((1.4426950408889634))))+(exp2((((val0+(val17+val33)+(val38+val54))-val70)*float((1.4426950408889634))))+acc0)))))))))))))))));
}`;

const E_16n1 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 16 */
  float val0 = float(texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r);
  out_data = float(float(val0));
}`;

const r_33600_16n2 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
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
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 33600 */
  float acc0 = float((0.0));
  int alu0 = (int(idx0)%int(int((8400))));
  int alu1 = (idx0/int((8400)));
  int alu2 = (alu0+(alu1*int((102400))));
  bool alu3 = (float(alu0)<float(int((6400))));
  float val0 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu2)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu2)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val1 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu2+int((6400)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu2+int((6400)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val2 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu2+int((12800)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu2+int((12800)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val3 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu2+int((19200)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu2+int((19200)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val4 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu2+int((25600)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu2+int((25600)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val5 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu2+int((32000)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu2+int((32000)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val6 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu2+int((38400)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu2+int((38400)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val7 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu2+int((44800)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu2+int((44800)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val8 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu2+int((51200)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu2+int((51200)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val9 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu2+int((57600)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu2+int((57600)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val10 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu2+int((64000)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu2+int((64000)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val11 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu2+int((70400)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu2+int((70400)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val12 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu2+int((76800)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu2+int((76800)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val13 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu2+int((83200)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu2+int((83200)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val14 = (float(alu3)!=0.0?float(texture(data1, vec2(float(float(int(alu2+int((89600)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu2+int((89600)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  int alu4 = (alu1*int((16)));
  int alu5 = (alu0/int((6400)));
  float val15 = (float(bool(int(alu3)*int((float((alu4+alu5))<float(int((49)))))))!=0.0?float(texture(data1, vec2(float(float(int(alu2+int((96000)))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu2+int((96000)))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  int alu6 = (alu1*(int((-16))));
  float val16 = (float(bool(int(alu3)*int((float((alu6+(alu5*(int((-1))))))<float((int((-48))))))))!=0.0?float(texture(data2, vec2(float(float(int(alu2+(int((-313600))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+(int((-313600))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
  int alu7 = (alu0+(alu1*int((25600))));
  int alu8 = (int((alu7+int((224000))))%int(int((230400))));
  int alu9 = (alu0*(int((-1))));
  bool alu10 = bool(int((float(alu9)<float((int((-6399))))))*int((float(alu0)<float(int((8000))))));
  int alu11 = (alu0/int((1600)));
  int alu12 = (alu4+alu11);
  int alu13 = (int((alu12+int((140))))%int(int((144))));
  float val17 = (float(bool(int(alu10)*int((float(alu13)<float(int((64)))))))!=0.0?float(texture(data3, vec2(float(float(int(alu8)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu8)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):float((0.0)));
  int alu14 = (int((alu7+int((225600))))%int(int((230400))));
  int alu15 = (int((alu12+int((141))))%int(int((144))));
  float val18 = (float(bool(int(alu10)*int((float(alu15)<float(int((64)))))))!=0.0?float(texture(data3, vec2(float(float(int(alu14)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu14)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):float((0.0)));
  int alu16 = (int((alu7+int((227200))))%int(int((230400))));
  int alu17 = (int((alu12+int((142))))%int(int((144))));
  float val19 = (float(bool(int(alu10)*int((float(alu17)<float(int((64)))))))!=0.0?float(texture(data3, vec2(float(float(int(alu16)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu16)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):float((0.0)));
  int alu18 = (int((alu7+int((228800))))%int(int((230400))));
  int alu19 = (int((alu12+int((143))))%int(int((144))));
  float val20 = (float(bool(int(alu10)*int((float(alu19)<float(int((64)))))))!=0.0?float(texture(data3, vec2(float(float(int(alu18)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu18)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):float((0.0)));
  float val21 = (float(alu10)!=0.0?float(texture(data3, vec2(float(float(int(alu7)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu7)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):float((0.0)));
  float val22 = (float(alu10)!=0.0?float(texture(data3, vec2(float(float(int(alu7+int((1600)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu7+int((1600)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):float((0.0)));
  float val23 = (float(alu10)!=0.0?float(texture(data3, vec2(float(float(int(alu7+int((3200)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu7+int((3200)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):float((0.0)));
  float val24 = (float(alu10)!=0.0?float(texture(data3, vec2(float(float(int(alu7+int((4800)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu7+int((4800)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):float((0.0)));
  float val25 = (float(alu10)!=0.0?float(texture(data3, vec2(float(float(int(alu7+int((6400)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu7+int((6400)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):float((0.0)));
  float val26 = (float(alu10)!=0.0?float(texture(data3, vec2(float(float(int(alu7+int((8000)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu7+int((8000)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):float((0.0)));
  float val27 = (float(alu10)!=0.0?float(texture(data3, vec2(float(float(int(alu7+int((9600)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu7+int((9600)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):float((0.0)));
  float val28 = (float(alu10)!=0.0?float(texture(data3, vec2(float(float(int(alu7+int((11200)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu7+int((11200)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):float((0.0)));
  float val29 = (float(alu10)!=0.0?float(texture(data3, vec2(float(float(int(alu7+int((12800)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu7+int((12800)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):float((0.0)));
  float val30 = (float(alu10)!=0.0?float(texture(data3, vec2(float(float(int(alu7+int((14400)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu7+int((14400)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):float((0.0)));
  float val31 = (float(alu10)!=0.0?float(texture(data3, vec2(float(float(int(alu7+int((16000)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu7+int((16000)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):float((0.0)));
  float val32 = (float(bool(int(alu10)*int((float(alu12)<float(int((53)))))))!=0.0?float(texture(data3, vec2(float(float(int(alu7+int((17600)))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu7+int((17600)))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):float((0.0)));
  float val33 = (float(bool(int(alu10)*int((float((alu13*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data4, vec2(float(float(int(alu8+(int((-102400))))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu8+(int((-102400))))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r):float((0.0)));
  float val34 = (float(bool(int(alu10)*int((float((alu15*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data4, vec2(float(float(int(alu14+(int((-102400))))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu14+(int((-102400))))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r):float((0.0)));
  float val35 = (float(bool(int(alu10)*int((float((alu17*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data4, vec2(float(float(int(alu16+(int((-102400))))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu16+(int((-102400))))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r):float((0.0)));
  float val36 = (float(bool(int(alu10)*int((float((alu19*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data4, vec2(float(float(int(alu18+(int((-102400))))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu18+(int((-102400))))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r):float((0.0)));
  float val37 = (float(bool(int(alu10)*int((float((alu6+(alu11*(int((-1))))))<float((int((-52))))))))!=0.0?float(texture(data4, vec2(float(float(int(alu7+(int((-84800))))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu7+(int((-84800))))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r):float((0.0)));
  int alu20 = (alu0+(alu1*int((6400))));
  int alu21 = (int((alu20+int((49600))))%int(int((57600))));
  bool alu22 = (float(alu9)<float((int((-7999)))));
  int alu23 = (alu4+(int((idx0/int((400))))%int(int((21)))));
  int alu24 = (int((alu23+int((124))))%int(int((144))));
  float val38 = (float(bool(int(alu22)*int((float(alu24)<float(int((64)))))))!=0.0?float(texture(data5, vec2(float(float(int(alu21)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu21)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r):float((0.0)));
  int alu25 = (int((alu20+int((50000))))%int(int((57600))));
  int alu26 = (int((alu23+int((125))))%int(int((144))));
  float val39 = (float(bool(int(alu22)*int((float(alu26)<float(int((64)))))))!=0.0?float(texture(data5, vec2(float(float(int(alu25)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu25)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r):float((0.0)));
  int alu27 = (int((alu20+int((50400))))%int(int((57600))));
  int alu28 = (int((alu23+int((126))))%int(int((144))));
  float val40 = (float(bool(int(alu22)*int((float(alu28)<float(int((64)))))))!=0.0?float(texture(data5, vec2(float(float(int(alu27)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu27)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r):float((0.0)));
  int alu29 = (int((alu20+int((50800))))%int(int((57600))));
  int alu30 = (int((alu23+int((127))))%int(int((144))));
  float val41 = (float(bool(int(alu22)*int((float(alu30)<float(int((64)))))))!=0.0?float(texture(data5, vec2(float(float(int(alu29)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu29)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r):float((0.0)));
  int alu31 = (int((alu20+int((51200))))%int(int((57600))));
  int alu32 = (int((alu23+int((128))))%int(int((144))));
  float val42 = (float(bool(int(alu22)*int((float(alu32)<float(int((64)))))))!=0.0?float(texture(data5, vec2(float(float(int(alu31)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu31)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r):float((0.0)));
  int alu33 = (int((alu20+int((51600))))%int(int((57600))));
  int alu34 = (int((alu23+int((129))))%int(int((144))));
  float val43 = (float(bool(int(alu22)*int((float(alu34)<float(int((64)))))))!=0.0?float(texture(data5, vec2(float(float(int(alu33)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu33)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r):float((0.0)));
  int alu35 = (int((alu20+int((52000))))%int(int((57600))));
  int alu36 = (int((alu23+int((130))))%int(int((144))));
  float val44 = (float(bool(int(alu22)*int((float(alu36)<float(int((64)))))))!=0.0?float(texture(data5, vec2(float(float(int(alu35)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu35)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r):float((0.0)));
  int alu37 = (int((alu20+int((52400))))%int(int((57600))));
  int alu38 = (int((alu23+int((131))))%int(int((144))));
  float val45 = (float(bool(int(alu22)*int((float(alu38)<float(int((64)))))))!=0.0?float(texture(data5, vec2(float(float(int(alu37)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu37)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r):float((0.0)));
  int alu39 = (int((alu20+int((52800))))%int(int((57600))));
  int alu40 = (int((alu23+int((132))))%int(int((144))));
  float val46 = (float(bool(int(alu22)*int((float(alu40)<float(int((64)))))))!=0.0?float(texture(data5, vec2(float(float(int(alu39)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu39)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r):float((0.0)));
  int alu41 = (int((alu20+int((53200))))%int(int((57600))));
  int alu42 = (int((alu23+int((133))))%int(int((144))));
  float val47 = (float(bool(int(alu22)*int((float(alu42)<float(int((64)))))))!=0.0?float(texture(data5, vec2(float(float(int(alu41)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu41)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r):float((0.0)));
  int alu43 = (int((alu20+int((53600))))%int(int((57600))));
  int alu44 = (int((alu23+int((134))))%int(int((144))));
  float val48 = (float(bool(int(alu22)*int((float(alu44)<float(int((64)))))))!=0.0?float(texture(data5, vec2(float(float(int(alu43)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu43)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r):float((0.0)));
  int alu45 = (int((alu20+int((54000))))%int(int((57600))));
  int alu46 = (int((alu23+int((135))))%int(int((144))));
  float val49 = (float(bool(int(alu22)*int((float(alu46)<float(int((64)))))))!=0.0?float(texture(data5, vec2(float(float(int(alu45)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu45)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r):float((0.0)));
  int alu47 = (int((alu20+int((54400))))%int(int((57600))));
  int alu48 = (int((alu23+int((136))))%int(int((144))));
  float val50 = (float(bool(int(alu22)*int((float(alu48)<float(int((64)))))))!=0.0?float(texture(data5, vec2(float(float(int(alu47)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu47)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r):float((0.0)));
  int alu49 = (int((alu20+int((54800))))%int(int((57600))));
  int alu50 = (int((alu23+int((137))))%int(int((144))));
  float val51 = (float(bool(int(alu22)*int((float(alu50)<float(int((64)))))))!=0.0?float(texture(data5, vec2(float(float(int(alu49)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu49)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r):float((0.0)));
  int alu51 = (int((alu20+int((55200))))%int(int((57600))));
  int alu52 = (int((alu23+int((138))))%int(int((144))));
  float val52 = (float(bool(int(alu22)*int((float(alu52)<float(int((64)))))))!=0.0?float(texture(data5, vec2(float(float(int(alu51)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu51)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r):float((0.0)));
  int alu53 = (int((alu20+int((55600))))%int(int((57600))));
  int alu54 = (int((alu23+int((139))))%int(int((144))));
  float val53 = (float(bool(int(alu22)*int((float(alu54)<float(int((64)))))))!=0.0?float(texture(data5, vec2(float(float(int(alu53)%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu53)/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r):float((0.0)));
  float val54 = (float(bool(int(alu22)*int((float((alu24*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data6, vec2(float(float(int(alu21+(int((-25600))))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu21+(int((-25600))))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r):float((0.0)));
  float val55 = (float(bool(int(alu22)*int((float((alu26*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data6, vec2(float(float(int(alu25+(int((-25600))))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu25+(int((-25600))))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r):float((0.0)));
  float val56 = (float(bool(int(alu22)*int((float((alu28*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data6, vec2(float(float(int(alu27+(int((-25600))))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu27+(int((-25600))))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r):float((0.0)));
  float val57 = (float(bool(int(alu22)*int((float((alu30*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data6, vec2(float(float(int(alu29+(int((-25600))))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu29+(int((-25600))))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r):float((0.0)));
  float val58 = (float(bool(int(alu22)*int((float((alu32*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data6, vec2(float(float(int(alu31+(int((-25600))))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu31+(int((-25600))))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r):float((0.0)));
  float val59 = (float(bool(int(alu22)*int((float((alu34*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data6, vec2(float(float(int(alu33+(int((-25600))))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu33+(int((-25600))))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r):float((0.0)));
  float val60 = (float(bool(int(alu22)*int((float((alu36*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data6, vec2(float(float(int(alu35+(int((-25600))))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu35+(int((-25600))))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r):float((0.0)));
  float val61 = (float(bool(int(alu22)*int((float((alu38*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data6, vec2(float(float(int(alu37+(int((-25600))))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu37+(int((-25600))))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r):float((0.0)));
  float val62 = (float(bool(int(alu22)*int((float((alu40*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data6, vec2(float(float(int(alu39+(int((-25600))))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu39+(int((-25600))))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r):float((0.0)));
  float val63 = (float(bool(int(alu22)*int((float((alu42*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data6, vec2(float(float(int(alu41+(int((-25600))))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu41+(int((-25600))))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r):float((0.0)));
  float val64 = (float(bool(int(alu22)*int((float((alu44*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data6, vec2(float(float(int(alu43+(int((-25600))))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu43+(int((-25600))))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r):float((0.0)));
  float val65 = (float(bool(int(alu22)*int((float((alu46*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data6, vec2(float(float(int(alu45+(int((-25600))))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu45+(int((-25600))))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r):float((0.0)));
  float val66 = (float(bool(int(alu22)*int((float((alu48*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data6, vec2(float(float(int(alu47+(int((-25600))))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu47+(int((-25600))))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r):float((0.0)));
  float val67 = (float(bool(int(alu22)*int((float((alu50*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data6, vec2(float(float(int(alu49+(int((-25600))))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu49+(int((-25600))))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r):float((0.0)));
  float val68 = (float(bool(int(alu22)*int((float((alu52*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data6, vec2(float(float(int(alu51+(int((-25600))))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu51+(int((-25600))))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r):float((0.0)));
  float val69 = (float(bool(int(alu22)*int((float((alu54*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data6, vec2(float(float(int(alu53+(int((-25600))))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu53+(int((-25600))))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r):float((0.0)));
  float val70 = float(texture(data7, vec2(float(float(int(idx0)%textureSize(data7, 0).x) + 0.5f)/float(textureSize(data7, 0).x), float(float(int(idx0)/textureSize(data7, 0).x) + 0.5f)/float(textureSize(data7, 0).y))).r);
  float val71 = float(texture(data8, vec2(float(float(int(idx0)%textureSize(data8, 0).x) + 0.5f)/float(textureSize(data8, 0).x), float(float(int(idx0)/textureSize(data8, 0).x) + 0.5f)/float(textureSize(data8, 0).y))).r);
  float val72 = float(texture(data9, vec2(float(float(int(int((0)))%textureSize(data9, 0).x) + 0.5f)/float(textureSize(data9, 0).x), float(float(int(int((0)))/textureSize(data9, 0).x) + 0.5f)/float(textureSize(data9, 0).y))).r);
  float val73 = float(texture(data9, vec2(float(float(int(int((1)))%textureSize(data9, 0).x) + 0.5f)/float(textureSize(data9, 0).x), float(float(int(int((1)))/textureSize(data9, 0).x) + 0.5f)/float(textureSize(data9, 0).y))).r);
  float val74 = float(texture(data9, vec2(float(float(int(int((2)))%textureSize(data9, 0).x) + 0.5f)/float(textureSize(data9, 0).x), float(float(int(int((2)))/textureSize(data9, 0).x) + 0.5f)/float(textureSize(data9, 0).y))).r);
  float val75 = float(texture(data9, vec2(float(float(int(int((3)))%textureSize(data9, 0).x) + 0.5f)/float(textureSize(data9, 0).x), float(float(int(int((3)))/textureSize(data9, 0).x) + 0.5f)/float(textureSize(data9, 0).y))).r);
  float val76 = float(texture(data9, vec2(float(float(int(int((4)))%textureSize(data9, 0).x) + 0.5f)/float(textureSize(data9, 0).x), float(float(int(int((4)))/textureSize(data9, 0).x) + 0.5f)/float(textureSize(data9, 0).y))).r);
  float val77 = float(texture(data9, vec2(float(float(int(int((5)))%textureSize(data9, 0).x) + 0.5f)/float(textureSize(data9, 0).x), float(float(int(int((5)))/textureSize(data9, 0).x) + 0.5f)/float(textureSize(data9, 0).y))).r);
  float val78 = float(texture(data9, vec2(float(float(int(int((6)))%textureSize(data9, 0).x) + 0.5f)/float(textureSize(data9, 0).x), float(float(int(int((6)))/textureSize(data9, 0).x) + 0.5f)/float(textureSize(data9, 0).y))).r);
  float val79 = float(texture(data9, vec2(float(float(int(int((7)))%textureSize(data9, 0).x) + 0.5f)/float(textureSize(data9, 0).x), float(float(int(int((7)))/textureSize(data9, 0).x) + 0.5f)/float(textureSize(data9, 0).y))).r);
  float val80 = float(texture(data9, vec2(float(float(int(int((8)))%textureSize(data9, 0).x) + 0.5f)/float(textureSize(data9, 0).x), float(float(int(int((8)))/textureSize(data9, 0).x) + 0.5f)/float(textureSize(data9, 0).y))).r);
  float val81 = float(texture(data9, vec2(float(float(int(int((9)))%textureSize(data9, 0).x) + 0.5f)/float(textureSize(data9, 0).x), float(float(int(int((9)))/textureSize(data9, 0).x) + 0.5f)/float(textureSize(data9, 0).y))).r);
  float val82 = float(texture(data9, vec2(float(float(int(int((10)))%textureSize(data9, 0).x) + 0.5f)/float(textureSize(data9, 0).x), float(float(int(int((10)))/textureSize(data9, 0).x) + 0.5f)/float(textureSize(data9, 0).y))).r);
  float val83 = float(texture(data9, vec2(float(float(int(int((11)))%textureSize(data9, 0).x) + 0.5f)/float(textureSize(data9, 0).x), float(float(int(int((11)))/textureSize(data9, 0).x) + 0.5f)/float(textureSize(data9, 0).y))).r);
  float val84 = float(texture(data9, vec2(float(float(int(int((12)))%textureSize(data9, 0).x) + 0.5f)/float(textureSize(data9, 0).x), float(float(int(int((12)))/textureSize(data9, 0).x) + 0.5f)/float(textureSize(data9, 0).y))).r);
  float val85 = float(texture(data9, vec2(float(float(int(int((13)))%textureSize(data9, 0).x) + 0.5f)/float(textureSize(data9, 0).x), float(float(int(int((13)))/textureSize(data9, 0).x) + 0.5f)/float(textureSize(data9, 0).y))).r);
  float val86 = float(texture(data9, vec2(float(float(int(int((14)))%textureSize(data9, 0).x) + 0.5f)/float(textureSize(data9, 0).x), float(float(int(int((14)))/textureSize(data9, 0).x) + 0.5f)/float(textureSize(data9, 0).y))).r);
  float val87 = float(texture(data9, vec2(float(float(int(int((15)))%textureSize(data9, 0).x) + 0.5f)/float(textureSize(data9, 0).x), float(float(int(int((15)))/textureSize(data9, 0).x) + 0.5f)/float(textureSize(data9, 0).y))).r);
  out_data = float((((exp2((((val15+val16+(val32+val37)+(val53+val69))-val70)*float((1.4426950408889634))))/val71)*val87)+(((exp2((((val14+val31+(val52+val68))-val70)*float((1.4426950408889634))))/val71)*val86)+(((exp2((((val13+val30+(val51+val67))-val70)*float((1.4426950408889634))))/val71)*val85)+(((exp2((((val12+val29+(val50+val66))-val70)*float((1.4426950408889634))))/val71)*val84)+(((exp2((((val11+val28+(val49+val65))-val70)*float((1.4426950408889634))))/val71)*val83)+(((exp2((((val10+val27+(val48+val64))-val70)*float((1.4426950408889634))))/val71)*val82)+(((exp2((((val9+val26+(val47+val63))-val70)*float((1.4426950408889634))))/val71)*val81)+(((exp2((((val8+val25+(val46+val62))-val70)*float((1.4426950408889634))))/val71)*val80)+(((exp2((((val7+val24+(val45+val61))-val70)*float((1.4426950408889634))))/val71)*val79)+(((exp2((((val6+val23+(val44+val60))-val70)*float((1.4426950408889634))))/val71)*val78)+(((exp2((((val5+val22+(val43+val59))-val70)*float((1.4426950408889634))))/val71)*val77)+(((exp2((((val4+val21+(val42+val58))-val70)*float((1.4426950408889634))))/val71)*val76)+(((exp2((((val3+(val20+val36)+(val41+val57))-val70)*float((1.4426950408889634))))/val71)*val75)+(((exp2((((val2+(val19+val35)+(val40+val56))-val70)*float((1.4426950408889634))))/val71)*val74)+(((exp2((((val1+(val18+val34)+(val39+val55))-val70)*float((1.4426950408889634))))/val71)*val73)+(((exp2((((val0+(val17+val33)+(val38+val54))-val70)*float((1.4426950408889634))))/val71)*val72)+acc0)))))))))))))))));
}`;

const E_16800 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
uniform sampler2D data7;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 16800 */
  int alu0 = (int(idx0)%int(int((8400))));
  bool alu1 = (float(alu0)<float(int((6400))));
  int alu2 = (idx0/int((8400)));
  bool alu3 = (float(alu2)<float(int((1))));
  float val0 = (float(bool(int(alu1)*int(alu3)))!=0.0?float(texture(data1, vec2(float(float(int(int(idx0)%int(int((80))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(int(idx0)%int(int((80))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  bool alu4 = (float((alu2*(int((-1)))))<float(int((0))));
  float val1 = (float(bool(int(alu1)*int(alu4)))!=0.0?float(texture(data2, vec2(float(float(int(int((int((idx0/int((80))))%int(int((105)))))%int(int((80))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(int((int((idx0/int((80))))%int(int((105)))))%int(int((80))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
  int alu5 = (alu0*(int((-1))));
  bool alu6 = bool(int((float(alu5)<float((int((-6399))))))*int((float(alu0)<float(int((8000))))));
  float val2 = (float(bool(int(alu6)*int(alu3)))!=0.0?float(texture(data3, vec2(float(float(int(int(idx0)%int(int((40))))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(int(idx0)%int(int((40))))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):float((0.0)));
  float val3 = (float(bool(int(alu6)*int(alu4)))!=0.0?float(texture(data4, vec2(float(float(int(int((int((idx0/int((40))))%int(int((210)))))%int(int((40))))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(int((int((idx0/int((40))))%int(int((210)))))%int(int((40))))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r):float((0.0)));
  bool alu7 = (float(alu5)<float((int((-7999)))));
  float val4 = (float(bool(int(alu7)*int(alu3)))!=0.0?float(texture(data5, vec2(float(float(int(int(idx0)%int(int((20))))%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(int(idx0)%int(int((20))))/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r):float((0.0)));
  float val5 = (float(bool(int(alu7)*int(alu4)))!=0.0?float(texture(data6, vec2(float(float(int(int((idx0/int((20))))%int(int((20))))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(int((idx0/int((20))))%int(int((20))))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r):float((0.0)));
  float val6 = float(texture(data7, vec2(float(float(int(idx0)%textureSize(data7, 0).x) + 0.5f)/float(textureSize(data7, 0).x), float(float(int(idx0)/textureSize(data7, 0).x) + 0.5f)/float(textureSize(data7, 0).y))).r);
  float val7 = float(texture(data7, vec2(float(float(int(idx0+int((16800)))%textureSize(data7, 0).x) + 0.5f)/float(textureSize(data7, 0).x), float(float(int(idx0+int((16800)))/textureSize(data7, 0).x) + 0.5f)/float(textureSize(data7, 0).y))).r);
  float alu8 = (val0+val1+(val2+val3)+(val4+val5));
  out_data = float((((alu8-val6)+(alu8+val7))*float((0.5))));
}`;

const E_16800n1 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
uniform sampler2D data7;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 16800 */
  int alu0 = (int(idx0)%int(int((8400))));
  bool alu1 = (float(alu0)<float(int((6400))));
  int alu2 = (idx0/int((8400)));
  bool alu3 = (float(alu2)<float(int((1))));
  float val0 = (float(bool(int(alu1)*int(alu3)))!=0.0?float(texture(data1, vec2(float(float(int(int(idx0)%int(int((80))))%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(int(idx0)%int(int((80))))/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  bool alu4 = (float((alu2*(int((-1)))))<float(int((0))));
  float val1 = (float(bool(int(alu1)*int(alu4)))!=0.0?float(texture(data2, vec2(float(float(int(int((int((idx0/int((80))))%int(int((105)))))%int(int((80))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(int((int((idx0/int((80))))%int(int((105)))))%int(int((80))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
  int alu5 = (alu0*(int((-1))));
  bool alu6 = bool(int((float(alu5)<float((int((-6399))))))*int((float(alu0)<float(int((8000))))));
  float val2 = (float(bool(int(alu6)*int(alu3)))!=0.0?float(texture(data3, vec2(float(float(int(int(idx0)%int(int((40))))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(int(idx0)%int(int((40))))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):float((0.0)));
  float val3 = (float(bool(int(alu6)*int(alu4)))!=0.0?float(texture(data4, vec2(float(float(int(int((int((idx0/int((40))))%int(int((210)))))%int(int((40))))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(int((int((idx0/int((40))))%int(int((210)))))%int(int((40))))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r):float((0.0)));
  bool alu7 = (float(alu5)<float((int((-7999)))));
  float val4 = (float(bool(int(alu7)*int(alu3)))!=0.0?float(texture(data5, vec2(float(float(int(int(idx0)%int(int((20))))%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(int(idx0)%int(int((20))))/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r):float((0.0)));
  float val5 = (float(bool(int(alu7)*int(alu4)))!=0.0?float(texture(data6, vec2(float(float(int(int((idx0/int((20))))%int(int((20))))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(int((idx0/int((20))))%int(int((20))))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r):float((0.0)));
  float val6 = float(texture(data7, vec2(float(float(int(idx0+int((16800)))%textureSize(data7, 0).x) + 0.5f)/float(textureSize(data7, 0).x), float(float(int(idx0+int((16800)))/textureSize(data7, 0).x) + 0.5f)/float(textureSize(data7, 0).y))).r);
  float val7 = float(texture(data7, vec2(float(float(int(idx0)%textureSize(data7, 0).x) + 0.5f)/float(textureSize(data7, 0).x), float(float(int(idx0)/textureSize(data7, 0).x) + 0.5f)/float(textureSize(data7, 0).y))).r);
  float alu8 = (val0+val1+(val2+val3)+(val4+val5));
  out_data = float(((alu8+val6)-(alu8-val7)));
}`;

const E_8400 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;

out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 8400 */
  int alu0 = (idx0*(int((-1))));
  out_data = float(float(((float((float(idx0)<float(int((6400)))))!=0.0?int((8.0)):int((0)))+(float(bool(int((float(alu0)<float((int((-6399))))))*int((float(idx0)<float(int((8000)))))))!=0.0?int((16.0)):int((0)))+(float((float(alu0)<float((int((-7999))))))!=0.0?int((32.0)):int((0))))));
}`;

const E_33600 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 33600 */
  float val0 = (float((float(idx0)<float(int((16800)))))!=0.0?float(texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val1 = (float((float((idx0*(int((-1)))))<float((int((-16799))))))!=0.0?float(texture(data2, vec2(float(float(int(idx0+(int((-16800))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(idx0+(int((-16800))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
  float val2 = float(texture(data3, vec2(float(float(int(int(idx0)%int(int((8400))))%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(int(idx0)%int(int((8400))))/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r);
  out_data = float(((val0+val1)*val2));
}`;

const E_672000 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
uniform sampler2D data3;
uniform sampler2D data4;
uniform sampler2D data5;
uniform sampler2D data6;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 672000 */
  int alu0 = (int(idx0)%int(int((8400))));
  int alu1 = (idx0/int((8400)));
  int alu2 = (int((alu0+(alu1*int((6400)))+int((409600))))%int(int((921600))));
  bool alu3 = (float(alu0)<float(int((6400))));
  int alu4 = (int((alu1+(alu0/int((6400)))+int((64))))%int(int((144))));
  float val0 = (float(bool(int(alu3)*int((float(alu4)<float(int((64)))))))!=0.0?float(texture(data1, vec2(float(float(int(alu2)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(alu2)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val1 = (float(bool(int(alu3)*int((float((alu4*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data2, vec2(float(float(int(alu2+(int((-409600))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(alu2+(int((-409600))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
  int alu5 = (int((alu0+(alu1*int((1600)))+int((96000))))%int(int((230400))));
  int alu6 = (alu0*(int((-1))));
  bool alu7 = bool(int((float(alu6)<float((int((-6399))))))*int((float(alu0)<float(int((8000))))));
  int alu8 = (int((alu1+(alu0/int((1600)))+int((60))))%int(int((144))));
  float val2 = (float(bool(int(alu7)*int((float(alu8)<float(int((64)))))))!=0.0?float(texture(data3, vec2(float(float(int(alu5)%textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).x), float(float(int(alu5)/textureSize(data3, 0).x) + 0.5f)/float(textureSize(data3, 0).y))).r):float((0.0)));
  float val3 = (float(bool(int(alu7)*int((float((alu8*(int((-1)))))<float((int((-63))))))))!=0.0?float(texture(data4, vec2(float(float(int(alu5+(int((-102400))))%textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).x), float(float(int(alu5+(int((-102400))))/textureSize(data4, 0).x) + 0.5f)/float(textureSize(data4, 0).y))).r):float((0.0)));
  int alu9 = (alu0+(alu1*int((400))));
  bool alu10 = (float(alu6)<float((int((-7999)))));
  int alu11 = (int((idx0/int((400))))%int(int((21))));
  float val4 = (float(bool(int(alu10)*int((float((alu1+alu11))<float(int((20)))))))!=0.0?float(texture(data5, vec2(float(float(int(alu9+int((17600)))%textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).x), float(float(int(alu9+int((17600)))/textureSize(data5, 0).x) + 0.5f)/float(textureSize(data5, 0).y))).r):float((0.0)));
  float val5 = (float(bool(int(alu10)*int((float(((alu1*(int((-1))))+(alu11*(int((-1))))))<float((int((-19))))))))!=0.0?float(texture(data6, vec2(float(float(int(alu9+(int((-8000))))%textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).x), float(float(int(alu9+(int((-8000))))/textureSize(data6, 0).x) + 0.5f)/float(textureSize(data6, 0).y))).r):float((0.0)));
  out_data = float((float((1.0))/(float((1.0))+exp2(((val0+val1+(val2+val3)+(val4+val5))*(float((-1.4426950408889634))))))));
}`;

const E_705600 = `#version 300 es
precision highp float;
precision highp int;
in vec2 uv;
uniform int width;
uniform sampler2D data1;
uniform sampler2D data2;
out float out_data;

void main() {
  int idx0 = int(gl_FragCoord.y-0.5) * width + int(gl_FragCoord.x-0.5); /* 705600 */
  float val0 = (float((float(idx0)<float(int((33600)))))!=0.0?float(texture(data1, vec2(float(float(int(idx0)%textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).x), float(float(int(idx0)/textureSize(data1, 0).x) + 0.5f)/float(textureSize(data1, 0).y))).r):float((0.0)));
  float val1 = (float((float((idx0*(int((-1)))))<float((int((-33599))))))!=0.0?float(texture(data2, vec2(float(float(int(idx0+(int((-33600))))%textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).x), float(float(int(idx0+(int((-33600))))/textureSize(data2, 0).x) + 0.5f)/float(textureSize(data2, 0).y))).r):float((0.0)));
  out_data = float((val0+val1));
}`;
const buf_0 = createTexture(gl, 80.0, false);;
    const buf_1 = createTexture(gl, 80.0, false);;
    const buf_2 = createTexture(gl, 40.0, false);;
    const buf_3 = createTexture(gl, 40.0, false);;
    const buf_4 = createTexture(gl, 20.0, false);;
    const buf_5 = createTexture(gl, 20.0, false);;
    const buf_6 = createTexture(gl, 432.0, false);;
    const buf_7 = createTexture(gl, 432.0, true, getTensorBuffer(safetensor, metadata['net.b1.0.conv.weight']));
    const buf_8 = createTexture(gl, 16.0, false);;
    const buf_9 = createTexture(gl, 16.0, true, getTensorBuffer(safetensor, metadata['net.b1.0.bn.running_mean']));
    const buf_10 = createTexture(gl, 16.0, false);;
    const buf_11 = createTexture(gl, 16.0, true, getTensorBuffer(safetensor, metadata['net.b1.0.bn.weight']));
    const buf_12 = createTexture(gl, 16.0, false);;
    const buf_13 = createTexture(gl, 16.0, true, getTensorBuffer(safetensor, metadata['net.b1.0.bn.bias']));
    const buf_14 = createTexture(gl, 1638400.0, false);;
    const input0 = createTexture(gl, 1228800.0, false);;
    const buf_15 = createTexture(gl, 16.0, true, getTensorBuffer(safetensor, metadata['net.b1.0.bn.running_var']));
    const buf_16 = createTexture(gl, 4608.0, false);;
    const buf_17 = createTexture(gl, 4608.0, true, getTensorBuffer(safetensor, metadata['net.b1.1.conv.weight']));
    const buf_18 = createTexture(gl, 32.0, false);;
    const buf_19 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['net.b1.1.bn.running_mean']));
    const buf_20 = createTexture(gl, 32.0, false);;
    const buf_21 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['net.b1.1.bn.weight']));
    const buf_22 = createTexture(gl, 32.0, false);;
    const buf_23 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['net.b1.1.bn.bias']));
    const buf_24 = createTexture(gl, 819200.0, false);;
    const buf_25 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['net.b1.1.bn.running_var']));
    const buf_26 = createTexture(gl, 1024.0, false);;
    const buf_27 = createTexture(gl, 1024.0, true, getTensorBuffer(safetensor, metadata['net.b2.0.cv1.conv.weight']));
    const buf_28 = createTexture(gl, 32.0, false);;
    const buf_29 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['net.b2.0.cv1.bn.running_mean']));
    const buf_30 = createTexture(gl, 32.0, false);;
    const buf_31 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['net.b2.0.cv1.bn.weight']));
    const buf_32 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['net.b2.0.cv1.bn.bias']));
    const buf_33 = createTexture(gl, 819200.0, false);;
    const buf_34 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['net.b2.0.cv1.bn.running_var']));
    const buf_35 = createTexture(gl, 2304.0, false);;
    const buf_36 = createTexture(gl, 2304.0, true, getTensorBuffer(safetensor, metadata['net.b2.0.bottleneck.0.cv1.conv.weight']));
    const buf_37 = createTexture(gl, 16.0, false);;
    const buf_38 = createTexture(gl, 16.0, true, getTensorBuffer(safetensor, metadata['net.b2.0.bottleneck.0.cv1.bn.running_mean']));
    const buf_39 = createTexture(gl, 16.0, false);;
    const buf_40 = createTexture(gl, 16.0, true, getTensorBuffer(safetensor, metadata['net.b2.0.bottleneck.0.cv1.bn.weight']));
    const buf_41 = createTexture(gl, 16.0, false);;
    const buf_42 = createTexture(gl, 16.0, true, getTensorBuffer(safetensor, metadata['net.b2.0.bottleneck.0.cv1.bn.bias']));
    const buf_43 = createTexture(gl, 409600.0, false);;
    const buf_44 = createTexture(gl, 16.0, true, getTensorBuffer(safetensor, metadata['net.b2.0.bottleneck.0.cv1.bn.running_var']));
    const buf_45 = createTexture(gl, 2304.0, false);;
    const buf_46 = createTexture(gl, 2304.0, true, getTensorBuffer(safetensor, metadata['net.b2.0.bottleneck.0.cv2.conv.weight']));
    const buf_47 = createTexture(gl, 16.0, false);;
    const buf_48 = createTexture(gl, 16.0, true, getTensorBuffer(safetensor, metadata['net.b2.0.bottleneck.0.cv2.bn.running_mean']));
    const buf_49 = createTexture(gl, 16.0, false);;
    const buf_50 = createTexture(gl, 16.0, true, getTensorBuffer(safetensor, metadata['net.b2.0.bottleneck.0.cv2.bn.weight']));
    const buf_51 = createTexture(gl, 16.0, false);;
    const buf_52 = createTexture(gl, 16.0, true, getTensorBuffer(safetensor, metadata['net.b2.0.bottleneck.0.cv2.bn.bias']));
    const buf_53 = createTexture(gl, 409600.0, false);;
    const buf_54 = createTexture(gl, 16.0, true, getTensorBuffer(safetensor, metadata['net.b2.0.bottleneck.0.cv2.bn.running_var']));
    const buf_55 = createTexture(gl, 1228800.0, false);;
    const buf_56 = createTexture(gl, 1536.0, false);;
    const buf_57 = createTexture(gl, 1536.0, true, getTensorBuffer(safetensor, metadata['net.b2.0.cv2.conv.weight']));
    const buf_58 = createTexture(gl, 32.0, false);;
    const buf_59 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['net.b2.0.cv2.bn.running_mean']));
    const buf_60 = createTexture(gl, 32.0, false);;
    const buf_61 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['net.b2.0.cv2.bn.weight']));
    const buf_62 = createTexture(gl, 32.0, false);;
    const buf_63 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['net.b2.0.cv2.bn.bias']));
    const buf_64 = createTexture(gl, 819200.0, false);;
    const buf_65 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['net.b2.0.cv2.bn.running_var']));
    const buf_66 = createTexture(gl, 18432.0, false);;
    const buf_67 = createTexture(gl, 18432.0, true, getTensorBuffer(safetensor, metadata['net.b2.1.conv.weight']));
    const buf_68 = createTexture(gl, 64.0, false);;
    const buf_69 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['net.b2.1.bn.running_mean']));
    const buf_70 = createTexture(gl, 64.0, false);;
    const buf_71 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['net.b2.1.bn.weight']));
    const buf_72 = createTexture(gl, 64.0, false);;
    const buf_73 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['net.b2.1.bn.bias']));
    const buf_74 = createTexture(gl, 409600.0, false);;
    const buf_75 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['net.b2.1.bn.running_var']));
    const buf_76 = createTexture(gl, 4096.0, false);;
    const buf_77 = createTexture(gl, 4096.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.cv1.conv.weight']));
    const buf_78 = createTexture(gl, 64.0, false);;
    const buf_79 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.cv1.bn.running_mean']));
    const buf_80 = createTexture(gl, 64.0, false);;
    const buf_81 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.cv1.bn.weight']));
    const buf_82 = createTexture(gl, 64.0, false);;
    const buf_83 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.cv1.bn.bias']));
    const buf_84 = createTexture(gl, 409600.0, false);;
    const buf_85 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.cv1.bn.running_var']));
    const buf_86 = createTexture(gl, 9216.0, false);;
    const buf_87 = createTexture(gl, 9216.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.bottleneck.0.cv1.conv.weight']));
    const buf_88 = createTexture(gl, 32.0, false);;
    const buf_89 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.bottleneck.0.cv1.bn.running_mean']));
    const buf_90 = createTexture(gl, 32.0, false);;
    const buf_91 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.bottleneck.0.cv1.bn.weight']));
    const buf_92 = createTexture(gl, 32.0, false);;
    const buf_93 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.bottleneck.0.cv1.bn.bias']));
    const buf_94 = createTexture(gl, 204800.0, false);;
    const buf_95 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.bottleneck.0.cv1.bn.running_var']));
    const buf_96 = createTexture(gl, 9216.0, false);;
    const buf_97 = createTexture(gl, 9216.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.bottleneck.0.cv2.conv.weight']));
    const buf_98 = createTexture(gl, 32.0, false);;
    const buf_99 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.bottleneck.0.cv2.bn.running_mean']));
    const buf_100 = createTexture(gl, 32.0, false);;
    const buf_101 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.bottleneck.0.cv2.bn.weight']));
    const buf_102 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.bottleneck.0.cv2.bn.bias']));
    const buf_103 = createTexture(gl, 204800.0, false);;
    const buf_104 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.bottleneck.0.cv2.bn.running_var']));
    const buf_105 = createTexture(gl, 9216.0, false);;
    const buf_106 = createTexture(gl, 9216.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.bottleneck.1.cv1.conv.weight']));
    const buf_107 = createTexture(gl, 32.0, false);;
    const buf_108 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.bottleneck.1.cv1.bn.running_mean']));
    const buf_109 = createTexture(gl, 32.0, false);;
    const buf_110 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.bottleneck.1.cv1.bn.weight']));
    const buf_111 = createTexture(gl, 32.0, false);;
    const buf_112 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.bottleneck.1.cv1.bn.bias']));
    const buf_113 = createTexture(gl, 204800.0, false);;
    const buf_114 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.bottleneck.1.cv1.bn.running_var']));
    const buf_115 = createTexture(gl, 9216.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.bottleneck.1.cv2.conv.weight']));
    const buf_116 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.bottleneck.1.cv2.bn.running_mean']));
    const buf_117 = createTexture(gl, 32.0, false);;
    const buf_118 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.bottleneck.1.cv2.bn.weight']));
    const buf_119 = createTexture(gl, 32.0, false);;
    const buf_120 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.bottleneck.1.cv2.bn.bias']));
    const buf_121 = createTexture(gl, 204800.0, false);;
    const buf_122 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.bottleneck.1.cv2.bn.running_var']));
    const buf_123 = createTexture(gl, 819200.0, false);;
    const buf_124 = createTexture(gl, 8192.0, false);;
    const buf_125 = createTexture(gl, 8192.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.cv2.conv.weight']));
    const buf_126 = createTexture(gl, 64.0, false);;
    const buf_127 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.cv2.bn.running_mean']));
    const buf_128 = createTexture(gl, 64.0, false);;
    const buf_129 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.cv2.bn.weight']));
    const buf_130 = createTexture(gl, 64.0, false);;
    const buf_131 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.cv2.bn.bias']));
    const buf_132 = createTexture(gl, 409600.0, false);;
    const buf_133 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['net.b2.2.cv2.bn.running_var']));
    const buf_134 = createTexture(gl, 73728.0, false);;
    const buf_135 = createTexture(gl, 73728.0, true, getTensorBuffer(safetensor, metadata['net.b3.0.conv.weight']));
    const buf_136 = createTexture(gl, 128.0, false);;
    const buf_137 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['net.b3.0.bn.running_mean']));
    const buf_138 = createTexture(gl, 128.0, false);;
    const buf_139 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['net.b3.0.bn.weight']));
    const buf_140 = createTexture(gl, 128.0, false);;
    const buf_141 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['net.b3.0.bn.bias']));
    const buf_142 = createTexture(gl, 204800.0, false);;
    const buf_143 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['net.b3.0.bn.running_var']));
    const buf_144 = createTexture(gl, 16384.0, false);;
    const buf_145 = createTexture(gl, 16384.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.cv1.conv.weight']));
    const buf_146 = createTexture(gl, 128.0, false);;
    const buf_147 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.cv1.bn.running_mean']));
    const buf_148 = createTexture(gl, 128.0, false);;
    const buf_149 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.cv1.bn.weight']));
    const buf_150 = createTexture(gl, 128.0, false);;
    const buf_151 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.cv1.bn.bias']));
    const buf_152 = createTexture(gl, 204800.0, false);;
    const buf_153 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.cv1.bn.running_var']));
    const buf_154 = createTexture(gl, 36864.0, false);;
    const buf_155 = createTexture(gl, 36864.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.bottleneck.0.cv1.conv.weight']));
    const buf_156 = createTexture(gl, 64.0, false);;
    const buf_157 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.bottleneck.0.cv1.bn.running_mean']));
    const buf_158 = createTexture(gl, 64.0, false);;
    const buf_159 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.bottleneck.0.cv1.bn.weight']));
    const buf_160 = createTexture(gl, 64.0, false);;
    const buf_161 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.bottleneck.0.cv1.bn.bias']));
    const buf_162 = createTexture(gl, 102400.0, false);;
    const buf_163 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.bottleneck.0.cv1.bn.running_var']));
    const buf_164 = createTexture(gl, 36864.0, false);;
    const buf_165 = createTexture(gl, 36864.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.bottleneck.0.cv2.conv.weight']));
    const buf_166 = createTexture(gl, 64.0, false);;
    const buf_167 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.bottleneck.0.cv2.bn.running_mean']));
    const buf_168 = createTexture(gl, 64.0, false);;
    const buf_169 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.bottleneck.0.cv2.bn.weight']));
    const buf_170 = createTexture(gl, 64.0, false);;
    const buf_171 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.bottleneck.0.cv2.bn.bias']));
    const buf_172 = createTexture(gl, 102400.0, false);;
    const buf_173 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.bottleneck.0.cv2.bn.running_var']));
    const buf_174 = createTexture(gl, 36864.0, false);;
    const buf_175 = createTexture(gl, 36864.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.bottleneck.1.cv1.conv.weight']));
    const buf_176 = createTexture(gl, 64.0, false);;
    const buf_177 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.bottleneck.1.cv1.bn.running_mean']));
    const buf_178 = createTexture(gl, 64.0, false);;
    const buf_179 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.bottleneck.1.cv1.bn.weight']));
    const buf_180 = createTexture(gl, 64.0, false);;
    const buf_181 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.bottleneck.1.cv1.bn.bias']));
    const buf_182 = createTexture(gl, 102400.0, false);;
    const buf_183 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.bottleneck.1.cv1.bn.running_var']));
    const buf_184 = createTexture(gl, 36864.0, false);;
    const buf_185 = createTexture(gl, 36864.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.bottleneck.1.cv2.conv.weight']));
    const buf_186 = createTexture(gl, 64.0, false);;
    const buf_187 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.bottleneck.1.cv2.bn.running_mean']));
    const buf_188 = createTexture(gl, 64.0, false);;
    const buf_189 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.bottleneck.1.cv2.bn.weight']));
    const buf_190 = createTexture(gl, 64.0, false);;
    const buf_191 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.bottleneck.1.cv2.bn.bias']));
    const buf_192 = createTexture(gl, 102400.0, false);;
    const buf_193 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.bottleneck.1.cv2.bn.running_var']));
    const buf_194 = createTexture(gl, 409600.0, false);;
    const buf_195 = createTexture(gl, 32768.0, false);;
    const buf_196 = createTexture(gl, 32768.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.cv2.conv.weight']));
    const buf_197 = createTexture(gl, 128.0, false);;
    const buf_198 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.cv2.bn.running_mean']));
    const buf_199 = createTexture(gl, 128.0, false);;
    const buf_200 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.cv2.bn.weight']));
    const buf_201 = createTexture(gl, 128.0, false);;
    const buf_202 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.cv2.bn.bias']));
    const buf_203 = createTexture(gl, 204800.0, false);;
    const buf_204 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['net.b3.1.cv2.bn.running_var']));
    const buf_205 = createTexture(gl, 294912.0, false);;
    const buf_206 = createTexture(gl, 294912.0, true, getTensorBuffer(safetensor, metadata['net.b4.0.conv.weight']));
    const buf_207 = createTexture(gl, 256.0, false);;
    const buf_208 = createTexture(gl, 256.0, true, getTensorBuffer(safetensor, metadata['net.b4.0.bn.running_mean']));
    const buf_209 = createTexture(gl, 256.0, false);;
    const buf_210 = createTexture(gl, 256.0, true, getTensorBuffer(safetensor, metadata['net.b4.0.bn.weight']));
    const buf_211 = createTexture(gl, 256.0, false);;
    const buf_212 = createTexture(gl, 256.0, true, getTensorBuffer(safetensor, metadata['net.b4.0.bn.bias']));
    const buf_213 = createTexture(gl, 102400.0, false);;
    const buf_214 = createTexture(gl, 256.0, true, getTensorBuffer(safetensor, metadata['net.b4.0.bn.running_var']));
    const buf_215 = createTexture(gl, 65536.0, false);;
    const buf_216 = createTexture(gl, 65536.0, true, getTensorBuffer(safetensor, metadata['net.b4.1.cv1.conv.weight']));
    const buf_217 = createTexture(gl, 256.0, false);;
    const buf_218 = createTexture(gl, 256.0, true, getTensorBuffer(safetensor, metadata['net.b4.1.cv1.bn.running_mean']));
    const buf_219 = createTexture(gl, 256.0, false);;
    const buf_220 = createTexture(gl, 256.0, true, getTensorBuffer(safetensor, metadata['net.b4.1.cv1.bn.weight']));
    const buf_221 = createTexture(gl, 256.0, false);;
    const buf_222 = createTexture(gl, 256.0, true, getTensorBuffer(safetensor, metadata['net.b4.1.cv1.bn.bias']));
    const buf_223 = createTexture(gl, 102400.0, false);;
    const buf_224 = createTexture(gl, 256.0, true, getTensorBuffer(safetensor, metadata['net.b4.1.cv1.bn.running_var']));
    const buf_225 = createTexture(gl, 147456.0, false);;
    const buf_226 = createTexture(gl, 147456.0, true, getTensorBuffer(safetensor, metadata['net.b4.1.bottleneck.0.cv1.conv.weight']));
    const buf_227 = createTexture(gl, 128.0, false);;
    const buf_228 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['net.b4.1.bottleneck.0.cv1.bn.running_mean']));
    const buf_229 = createTexture(gl, 128.0, false);;
    const buf_230 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['net.b4.1.bottleneck.0.cv1.bn.weight']));
    const buf_231 = createTexture(gl, 128.0, false);;
    const buf_232 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['net.b4.1.bottleneck.0.cv1.bn.bias']));
    const buf_233 = createTexture(gl, 51200.0, false);;
    const buf_234 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['net.b4.1.bottleneck.0.cv1.bn.running_var']));
    const buf_235 = createTexture(gl, 147456.0, false);;
    const buf_236 = createTexture(gl, 147456.0, true, getTensorBuffer(safetensor, metadata['net.b4.1.bottleneck.0.cv2.conv.weight']));
    const buf_237 = createTexture(gl, 128.0, false);;
    const buf_238 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['net.b4.1.bottleneck.0.cv2.bn.running_mean']));
    const buf_239 = createTexture(gl, 128.0, false);;
    const buf_240 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['net.b4.1.bottleneck.0.cv2.bn.weight']));
    const buf_241 = createTexture(gl, 128.0, false);;
    const buf_242 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['net.b4.1.bottleneck.0.cv2.bn.bias']));
    const buf_243 = createTexture(gl, 51200.0, false);;
    const buf_244 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['net.b4.1.bottleneck.0.cv2.bn.running_var']));
    const buf_245 = createTexture(gl, 153600.0, false);;
    const buf_246 = createTexture(gl, 98304.0, false);;
    const buf_247 = createTexture(gl, 98304.0, true, getTensorBuffer(safetensor, metadata['net.b4.1.cv2.conv.weight']));
    const buf_248 = createTexture(gl, 256.0, false);;
    const buf_249 = createTexture(gl, 256.0, true, getTensorBuffer(safetensor, metadata['net.b4.1.cv2.bn.running_mean']));
    const buf_250 = createTexture(gl, 256.0, false);;
    const buf_251 = createTexture(gl, 256.0, true, getTensorBuffer(safetensor, metadata['net.b4.1.cv2.bn.weight']));
    const buf_252 = createTexture(gl, 256.0, false);;
    const buf_253 = createTexture(gl, 256.0, true, getTensorBuffer(safetensor, metadata['net.b4.1.cv2.bn.bias']));
    const buf_254 = createTexture(gl, 102400.0, false);;
    const buf_255 = createTexture(gl, 256.0, true, getTensorBuffer(safetensor, metadata['net.b4.1.cv2.bn.running_var']));
    const buf_256 = createTexture(gl, 32768.0, false);;
    const buf_257 = createTexture(gl, 32768.0, true, getTensorBuffer(safetensor, metadata['net.b5.0.cv1.conv.weight']));
    const buf_258 = createTexture(gl, 128.0, false);;
    const buf_259 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['net.b5.0.cv1.bn.running_mean']));
    const buf_260 = createTexture(gl, 128.0, false);;
    const buf_261 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['net.b5.0.cv1.bn.weight']));
    const buf_262 = createTexture(gl, 128.0, false);;
    const buf_263 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['net.b5.0.cv1.bn.bias']));
    const buf_264 = createTexture(gl, 51200.0, false);;
    const buf_265 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['net.b5.0.cv1.bn.running_var']));
    const buf_266 = createTexture(gl, 51200.0, false);;
    const buf_267 = createTexture(gl, 51200.0, false);;
    const buf_268 = createTexture(gl, 51200.0, false);;
    const buf_269 = createTexture(gl, 204800.0, false);;
    const buf_270 = createTexture(gl, 131072.0, false);;
    const buf_271 = createTexture(gl, 131072.0, true, getTensorBuffer(safetensor, metadata['net.b5.0.cv2.conv.weight']));
    const buf_272 = createTexture(gl, 256.0, false);;
    const buf_273 = createTexture(gl, 256.0, true, getTensorBuffer(safetensor, metadata['net.b5.0.cv2.bn.running_mean']));
    const buf_274 = createTexture(gl, 256.0, false);;
    const buf_275 = createTexture(gl, 256.0, true, getTensorBuffer(safetensor, metadata['net.b5.0.cv2.bn.weight']));
    const buf_276 = createTexture(gl, 256.0, false);;
    const buf_277 = createTexture(gl, 256.0, true, getTensorBuffer(safetensor, metadata['net.b5.0.cv2.bn.bias']));
    const buf_278 = createTexture(gl, 102400.0, false);;
    const buf_279 = createTexture(gl, 256.0, true, getTensorBuffer(safetensor, metadata['net.b5.0.cv2.bn.running_var']));
    const buf_280 = createTexture(gl, 409600.0, false);;
    const buf_281 = createTexture(gl, 614400.0, false);;
    const buf_282 = createTexture(gl, 49152.0, false);;
    const buf_283 = createTexture(gl, 49152.0, true, getTensorBuffer(safetensor, metadata['fpn.n1.cv1.conv.weight']));
    const buf_284 = createTexture(gl, 128.0, false);;
    const buf_285 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['fpn.n1.cv1.bn.running_mean']));
    const buf_286 = createTexture(gl, 128.0, false);;
    const buf_287 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['fpn.n1.cv1.bn.weight']));
    const buf_288 = createTexture(gl, 128.0, false);;
    const buf_289 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['fpn.n1.cv1.bn.bias']));
    const buf_290 = createTexture(gl, 204800.0, false);;
    const buf_291 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['fpn.n1.cv1.bn.running_var']));
    const buf_292 = createTexture(gl, 36864.0, false);;
    const buf_293 = createTexture(gl, 36864.0, true, getTensorBuffer(safetensor, metadata['fpn.n1.bottleneck.0.cv1.conv.weight']));
    const buf_294 = createTexture(gl, 64.0, false);;
    const buf_295 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['fpn.n1.bottleneck.0.cv1.bn.running_mean']));
    const buf_296 = createTexture(gl, 64.0, false);;
    const buf_297 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['fpn.n1.bottleneck.0.cv1.bn.weight']));
    const buf_298 = createTexture(gl, 64.0, false);;
    const buf_299 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['fpn.n1.bottleneck.0.cv1.bn.bias']));
    const buf_300 = createTexture(gl, 102400.0, false);;
    const buf_301 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['fpn.n1.bottleneck.0.cv1.bn.running_var']));
    const buf_302 = createTexture(gl, 36864.0, false);;
    const buf_303 = createTexture(gl, 36864.0, true, getTensorBuffer(safetensor, metadata['fpn.n1.bottleneck.0.cv2.conv.weight']));
    const buf_304 = createTexture(gl, 64.0, false);;
    const buf_305 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['fpn.n1.bottleneck.0.cv2.bn.running_mean']));
    const buf_306 = createTexture(gl, 64.0, false);;
    const buf_307 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['fpn.n1.bottleneck.0.cv2.bn.weight']));
    const buf_308 = createTexture(gl, 64.0, false);;
    const buf_309 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['fpn.n1.bottleneck.0.cv2.bn.bias']));
    const buf_310 = createTexture(gl, 102400.0, false);;
    const buf_311 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['fpn.n1.bottleneck.0.cv2.bn.running_var']));
    const buf_312 = createTexture(gl, 307200.0, false);;
    const buf_313 = createTexture(gl, 24576.0, false);;
    const buf_314 = createTexture(gl, 24576.0, true, getTensorBuffer(safetensor, metadata['fpn.n1.cv2.conv.weight']));
    const buf_315 = createTexture(gl, 128.0, false);;
    const buf_316 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['fpn.n1.cv2.bn.running_mean']));
    const buf_317 = createTexture(gl, 128.0, false);;
    const buf_318 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['fpn.n1.cv2.bn.weight']));
    const buf_319 = createTexture(gl, 128.0, false);;
    const buf_320 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['fpn.n1.cv2.bn.bias']));
    const buf_321 = createTexture(gl, 204800.0, false);;
    const buf_322 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['fpn.n1.cv2.bn.running_var']));
    const buf_323 = createTexture(gl, 819200.0, false);;
    const buf_324 = createTexture(gl, 1228800.0, false);;
    const buf_325 = createTexture(gl, 12288.0, false);;
    const buf_326 = createTexture(gl, 12288.0, true, getTensorBuffer(safetensor, metadata['fpn.n2.cv1.conv.weight']));
    const buf_327 = createTexture(gl, 64.0, false);;
    const buf_328 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['fpn.n2.cv1.bn.running_mean']));
    const buf_329 = createTexture(gl, 64.0, false);;
    const buf_330 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['fpn.n2.cv1.bn.weight']));
    const buf_331 = createTexture(gl, 64.0, false);;
    const buf_332 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['fpn.n2.cv1.bn.bias']));
    const buf_333 = createTexture(gl, 409600.0, false);;
    const buf_334 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['fpn.n2.cv1.bn.running_var']));
    const buf_335 = createTexture(gl, 9216.0, false);;
    const buf_336 = createTexture(gl, 9216.0, true, getTensorBuffer(safetensor, metadata['fpn.n2.bottleneck.0.cv1.conv.weight']));
    const buf_337 = createTexture(gl, 32.0, false);;
    const buf_338 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['fpn.n2.bottleneck.0.cv1.bn.running_mean']));
    const buf_339 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['fpn.n2.bottleneck.0.cv1.bn.weight']));
    const buf_340 = createTexture(gl, 32.0, false);;
    const buf_341 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['fpn.n2.bottleneck.0.cv1.bn.bias']));
    const buf_342 = createTexture(gl, 204800.0, false);;
    const buf_343 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['fpn.n2.bottleneck.0.cv1.bn.running_var']));
    const buf_344 = createTexture(gl, 9216.0, false);;
    const buf_345 = createTexture(gl, 9216.0, true, getTensorBuffer(safetensor, metadata['fpn.n2.bottleneck.0.cv2.conv.weight']));
    const buf_346 = createTexture(gl, 32.0, false);;
    const buf_347 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['fpn.n2.bottleneck.0.cv2.bn.running_mean']));
    const buf_348 = createTexture(gl, 32.0, false);;
    const buf_349 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['fpn.n2.bottleneck.0.cv2.bn.weight']));
    const buf_350 = createTexture(gl, 32.0, false);;
    const buf_351 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['fpn.n2.bottleneck.0.cv2.bn.bias']));
    const buf_352 = createTexture(gl, 204800.0, false);;
    const buf_353 = createTexture(gl, 32.0, true, getTensorBuffer(safetensor, metadata['fpn.n2.bottleneck.0.cv2.bn.running_var']));
    const buf_354 = createTexture(gl, 614400.0, false);;
    const buf_355 = createTexture(gl, 6144.0, false);;
    const buf_356 = createTexture(gl, 6144.0, true, getTensorBuffer(safetensor, metadata['fpn.n2.cv2.conv.weight']));
    const buf_357 = createTexture(gl, 64.0, false);;
    const buf_358 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['fpn.n2.cv2.bn.running_mean']));
    const buf_359 = createTexture(gl, 64.0, false);;
    const buf_360 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['fpn.n2.cv2.bn.weight']));
    const buf_361 = createTexture(gl, 64.0, false);;
    const buf_362 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['fpn.n2.cv2.bn.bias']));
    const buf_363 = createTexture(gl, 409600.0, false);;
    const buf_364 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['fpn.n2.cv2.bn.running_var']));
    const buf_365 = createTexture(gl, 36864.0, false);;
    const buf_366 = createTexture(gl, 36864.0, true, getTensorBuffer(safetensor, metadata['head.cv2.0.0.conv.weight']));
    const buf_367 = createTexture(gl, 64.0, false);;
    const buf_368 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['head.cv2.0.0.bn.running_mean']));
    const buf_369 = createTexture(gl, 64.0, false);;
    const buf_370 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['head.cv2.0.0.bn.weight']));
    const buf_371 = createTexture(gl, 64.0, false);;
    const buf_372 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['head.cv2.0.0.bn.bias']));
    const buf_373 = createTexture(gl, 409600.0, false);;
    const buf_374 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['head.cv2.0.0.bn.running_var']));
    const buf_375 = createTexture(gl, 36864.0, false);;
    const buf_376 = createTexture(gl, 36864.0, true, getTensorBuffer(safetensor, metadata['head.cv2.0.1.conv.weight']));
    const buf_377 = createTexture(gl, 64.0, false);;
    const buf_378 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['head.cv2.0.1.bn.running_mean']));
    const buf_379 = createTexture(gl, 64.0, false);;
    const buf_380 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['head.cv2.0.1.bn.weight']));
    const buf_381 = createTexture(gl, 64.0, false);;
    const buf_382 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['head.cv2.0.1.bn.bias']));
    const buf_383 = createTexture(gl, 409600.0, false);;
    const buf_384 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['head.cv2.0.1.bn.running_var']));
    const buf_385 = createTexture(gl, 4096.0, false);;
    const buf_386 = createTexture(gl, 4096.0, true, getTensorBuffer(safetensor, metadata['head.cv2.0.2.weight']));
    const buf_387 = createTexture(gl, 64.0, false);;
    const buf_388 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['head.cv2.0.2.bias']));
    const buf_389 = createTexture(gl, 409600.0, false);;
    const buf_390 = createTexture(gl, 46080.0, false);;
    const buf_391 = createTexture(gl, 46080.0, true, getTensorBuffer(safetensor, metadata['head.cv3.0.0.conv.weight']));
    const buf_392 = createTexture(gl, 80.0, false);;
    const buf_393 = createTexture(gl, 80.0, true, getTensorBuffer(safetensor, metadata['head.cv3.0.0.bn.running_mean']));
    const buf_394 = createTexture(gl, 80.0, false);;
    const buf_395 = createTexture(gl, 80.0, true, getTensorBuffer(safetensor, metadata['head.cv3.0.0.bn.weight']));
    const buf_396 = createTexture(gl, 80.0, false);;
    const buf_397 = createTexture(gl, 80.0, true, getTensorBuffer(safetensor, metadata['head.cv3.0.0.bn.bias']));
    const buf_398 = createTexture(gl, 512000.0, false);;
    const buf_399 = createTexture(gl, 80.0, true, getTensorBuffer(safetensor, metadata['head.cv3.0.0.bn.running_var']));
    const buf_400 = createTexture(gl, 57600.0, false);;
    const buf_401 = createTexture(gl, 57600.0, true, getTensorBuffer(safetensor, metadata['head.cv3.0.1.conv.weight']));
    const buf_402 = createTexture(gl, 80.0, false);;
    const buf_403 = createTexture(gl, 80.0, true, getTensorBuffer(safetensor, metadata['head.cv3.0.1.bn.running_mean']));
    const buf_404 = createTexture(gl, 80.0, false);;
    const buf_405 = createTexture(gl, 80.0, true, getTensorBuffer(safetensor, metadata['head.cv3.0.1.bn.weight']));
    const buf_406 = createTexture(gl, 80.0, false);;
    const buf_407 = createTexture(gl, 80.0, true, getTensorBuffer(safetensor, metadata['head.cv3.0.1.bn.bias']));
    const buf_408 = createTexture(gl, 512000.0, false);;
    const buf_409 = createTexture(gl, 80.0, true, getTensorBuffer(safetensor, metadata['head.cv3.0.1.bn.running_var']));
    const buf_410 = createTexture(gl, 6400.0, false);;
    const buf_411 = createTexture(gl, 6400.0, true, getTensorBuffer(safetensor, metadata['head.cv3.0.2.weight']));
    const buf_412 = createTexture(gl, 80.0, false);;
    const buf_413 = createTexture(gl, 80.0, true, getTensorBuffer(safetensor, metadata['head.cv3.0.2.bias']));
    const buf_414 = createTexture(gl, 512000.0, false);;
    const buf_415 = createTexture(gl, 36864.0, false);;
    const buf_416 = createTexture(gl, 36864.0, true, getTensorBuffer(safetensor, metadata['fpn.n3.conv.weight']));
    const buf_417 = createTexture(gl, 64.0, false);;
    const buf_418 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['fpn.n3.bn.running_mean']));
    const buf_419 = createTexture(gl, 64.0, false);;
    const buf_420 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['fpn.n3.bn.weight']));
    const buf_421 = createTexture(gl, 64.0, false);;
    const buf_422 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['fpn.n3.bn.bias']));
    const buf_423 = createTexture(gl, 102400.0, false);;
    const buf_424 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['fpn.n3.bn.running_var']));
    const buf_425 = createTexture(gl, 307200.0, false);;
    const buf_426 = createTexture(gl, 24576.0, false);;
    const buf_427 = createTexture(gl, 24576.0, true, getTensorBuffer(safetensor, metadata['fpn.n4.cv1.conv.weight']));
    const buf_428 = createTexture(gl, 128.0, false);;
    const buf_429 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['fpn.n4.cv1.bn.running_mean']));
    const buf_430 = createTexture(gl, 128.0, false);;
    const buf_431 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['fpn.n4.cv1.bn.weight']));
    const buf_432 = createTexture(gl, 128.0, false);;
    const buf_433 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['fpn.n4.cv1.bn.bias']));
    const buf_434 = createTexture(gl, 204800.0, false);;
    const buf_435 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['fpn.n4.cv1.bn.running_var']));
    const buf_436 = createTexture(gl, 36864.0, false);;
    const buf_437 = createTexture(gl, 36864.0, true, getTensorBuffer(safetensor, metadata['fpn.n4.bottleneck.0.cv1.conv.weight']));
    const buf_438 = createTexture(gl, 64.0, false);;
    const buf_439 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['fpn.n4.bottleneck.0.cv1.bn.running_mean']));
    const buf_440 = createTexture(gl, 64.0, false);;
    const buf_441 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['fpn.n4.bottleneck.0.cv1.bn.weight']));
    const buf_442 = createTexture(gl, 64.0, false);;
    const buf_443 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['fpn.n4.bottleneck.0.cv1.bn.bias']));
    const buf_444 = createTexture(gl, 102400.0, false);;
    const buf_445 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['fpn.n4.bottleneck.0.cv1.bn.running_var']));
    const buf_446 = createTexture(gl, 36864.0, false);;
    const buf_447 = createTexture(gl, 36864.0, true, getTensorBuffer(safetensor, metadata['fpn.n4.bottleneck.0.cv2.conv.weight']));
    const buf_448 = createTexture(gl, 64.0, false);;
    const buf_449 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['fpn.n4.bottleneck.0.cv2.bn.running_mean']));
    const buf_450 = createTexture(gl, 64.0, false);;
    const buf_451 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['fpn.n4.bottleneck.0.cv2.bn.weight']));
    const buf_452 = createTexture(gl, 64.0, false);;
    const buf_453 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['fpn.n4.bottleneck.0.cv2.bn.bias']));
    const buf_454 = createTexture(gl, 102400.0, false);;
    const buf_455 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['fpn.n4.bottleneck.0.cv2.bn.running_var']));
    const buf_456 = createTexture(gl, 307200.0, false);;
    const buf_457 = createTexture(gl, 24576.0, false);;
    const buf_458 = createTexture(gl, 24576.0, true, getTensorBuffer(safetensor, metadata['fpn.n4.cv2.conv.weight']));
    const buf_459 = createTexture(gl, 128.0, false);;
    const buf_460 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['fpn.n4.cv2.bn.running_mean']));
    const buf_461 = createTexture(gl, 128.0, false);;
    const buf_462 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['fpn.n4.cv2.bn.weight']));
    const buf_463 = createTexture(gl, 128.0, false);;
    const buf_464 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['fpn.n4.cv2.bn.bias']));
    const buf_465 = createTexture(gl, 204800.0, false);;
    const buf_466 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['fpn.n4.cv2.bn.running_var']));
    const buf_467 = createTexture(gl, 73728.0, false);;
    const buf_468 = createTexture(gl, 73728.0, true, getTensorBuffer(safetensor, metadata['head.cv2.1.0.conv.weight']));
    const buf_469 = createTexture(gl, 64.0, false);;
    const buf_470 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['head.cv2.1.0.bn.running_mean']));
    const buf_471 = createTexture(gl, 64.0, false);;
    const buf_472 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['head.cv2.1.0.bn.weight']));
    const buf_473 = createTexture(gl, 64.0, false);;
    const buf_474 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['head.cv2.1.0.bn.bias']));
    const buf_475 = createTexture(gl, 102400.0, false);;
    const buf_476 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['head.cv2.1.0.bn.running_var']));
    const buf_477 = createTexture(gl, 36864.0, false);;
    const buf_478 = createTexture(gl, 36864.0, true, getTensorBuffer(safetensor, metadata['head.cv2.1.1.conv.weight']));
    const buf_479 = createTexture(gl, 64.0, false);;
    const buf_480 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['head.cv2.1.1.bn.running_mean']));
    const buf_481 = createTexture(gl, 64.0, false);;
    const buf_482 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['head.cv2.1.1.bn.weight']));
    const buf_483 = createTexture(gl, 64.0, false);;
    const buf_484 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['head.cv2.1.1.bn.bias']));
    const buf_485 = createTexture(gl, 102400.0, false);;
    const buf_486 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['head.cv2.1.1.bn.running_var']));
    const buf_487 = createTexture(gl, 4096.0, false);;
    const buf_488 = createTexture(gl, 4096.0, true, getTensorBuffer(safetensor, metadata['head.cv2.1.2.weight']));
    const buf_489 = createTexture(gl, 64.0, false);;
    const buf_490 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['head.cv2.1.2.bias']));
    const buf_491 = createTexture(gl, 102400.0, false);;
    const buf_492 = createTexture(gl, 92160.0, false);;
    const buf_493 = createTexture(gl, 92160.0, true, getTensorBuffer(safetensor, metadata['head.cv3.1.0.conv.weight']));
    const buf_494 = createTexture(gl, 80.0, false);;
    const buf_495 = createTexture(gl, 80.0, true, getTensorBuffer(safetensor, metadata['head.cv3.1.0.bn.running_mean']));
    const buf_496 = createTexture(gl, 80.0, false);;
    const buf_497 = createTexture(gl, 80.0, true, getTensorBuffer(safetensor, metadata['head.cv3.1.0.bn.weight']));
    const buf_498 = createTexture(gl, 80.0, false);;
    const buf_499 = createTexture(gl, 80.0, true, getTensorBuffer(safetensor, metadata['head.cv3.1.0.bn.bias']));
    const buf_500 = createTexture(gl, 128000.0, false);;
    const buf_501 = createTexture(gl, 80.0, true, getTensorBuffer(safetensor, metadata['head.cv3.1.0.bn.running_var']));
    const buf_502 = createTexture(gl, 57600.0, false);;
    const buf_503 = createTexture(gl, 57600.0, true, getTensorBuffer(safetensor, metadata['head.cv3.1.1.conv.weight']));
    const buf_504 = createTexture(gl, 80.0, false);;
    const buf_505 = createTexture(gl, 80.0, true, getTensorBuffer(safetensor, metadata['head.cv3.1.1.bn.running_mean']));
    const buf_506 = createTexture(gl, 80.0, false);;
    const buf_507 = createTexture(gl, 80.0, true, getTensorBuffer(safetensor, metadata['head.cv3.1.1.bn.weight']));
    const buf_508 = createTexture(gl, 80.0, false);;
    const buf_509 = createTexture(gl, 80.0, true, getTensorBuffer(safetensor, metadata['head.cv3.1.1.bn.bias']));
    const buf_510 = createTexture(gl, 128000.0, false);;
    const buf_511 = createTexture(gl, 80.0, true, getTensorBuffer(safetensor, metadata['head.cv3.1.1.bn.running_var']));
    const buf_512 = createTexture(gl, 6400.0, false);;
    const buf_513 = createTexture(gl, 6400.0, true, getTensorBuffer(safetensor, metadata['head.cv3.1.2.weight']));
    const buf_514 = createTexture(gl, 80.0, false);;
    const buf_515 = createTexture(gl, 80.0, true, getTensorBuffer(safetensor, metadata['head.cv3.1.2.bias']));
    const buf_516 = createTexture(gl, 128000.0, false);;
    const buf_517 = createTexture(gl, 147456.0, false);;
    const buf_518 = createTexture(gl, 147456.0, true, getTensorBuffer(safetensor, metadata['fpn.n5.conv.weight']));
    const buf_519 = createTexture(gl, 128.0, false);;
    const buf_520 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['fpn.n5.bn.running_mean']));
    const buf_521 = createTexture(gl, 128.0, false);;
    const buf_522 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['fpn.n5.bn.weight']));
    const buf_523 = createTexture(gl, 128.0, false);;
    const buf_524 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['fpn.n5.bn.bias']));
    const buf_525 = createTexture(gl, 51200.0, false);;
    const buf_526 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['fpn.n5.bn.running_var']));
    const buf_527 = createTexture(gl, 153600.0, false);;
    const buf_528 = createTexture(gl, 98304.0, false);;
    const buf_529 = createTexture(gl, 98304.0, true, getTensorBuffer(safetensor, metadata['fpn.n6.cv1.conv.weight']));
    const buf_530 = createTexture(gl, 256.0, false);;
    const buf_531 = createTexture(gl, 256.0, true, getTensorBuffer(safetensor, metadata['fpn.n6.cv1.bn.running_mean']));
    const buf_532 = createTexture(gl, 256.0, false);;
    const buf_533 = createTexture(gl, 256.0, true, getTensorBuffer(safetensor, metadata['fpn.n6.cv1.bn.weight']));
    const buf_534 = createTexture(gl, 256.0, false);;
    const buf_535 = createTexture(gl, 256.0, true, getTensorBuffer(safetensor, metadata['fpn.n6.cv1.bn.bias']));
    const buf_536 = createTexture(gl, 102400.0, false);;
    const buf_537 = createTexture(gl, 256.0, true, getTensorBuffer(safetensor, metadata['fpn.n6.cv1.bn.running_var']));
    const buf_538 = createTexture(gl, 147456.0, false);;
    const buf_539 = createTexture(gl, 147456.0, true, getTensorBuffer(safetensor, metadata['fpn.n6.bottleneck.0.cv1.conv.weight']));
    const buf_540 = createTexture(gl, 128.0, false);;
    const buf_541 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['fpn.n6.bottleneck.0.cv1.bn.running_mean']));
    const buf_542 = createTexture(gl, 128.0, false);;
    const buf_543 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['fpn.n6.bottleneck.0.cv1.bn.weight']));
    const buf_544 = createTexture(gl, 128.0, false);;
    const buf_545 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['fpn.n6.bottleneck.0.cv1.bn.bias']));
    const buf_546 = createTexture(gl, 51200.0, false);;
    const buf_547 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['fpn.n6.bottleneck.0.cv1.bn.running_var']));
    const buf_548 = createTexture(gl, 147456.0, false);;
    const buf_549 = createTexture(gl, 147456.0, true, getTensorBuffer(safetensor, metadata['fpn.n6.bottleneck.0.cv2.conv.weight']));
    const buf_550 = createTexture(gl, 128.0, false);;
    const buf_551 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['fpn.n6.bottleneck.0.cv2.bn.running_mean']));
    const buf_552 = createTexture(gl, 128.0, false);;
    const buf_553 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['fpn.n6.bottleneck.0.cv2.bn.weight']));
    const buf_554 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['fpn.n6.bottleneck.0.cv2.bn.bias']));
    const buf_555 = createTexture(gl, 51200.0, false);;
    const buf_556 = createTexture(gl, 128.0, true, getTensorBuffer(safetensor, metadata['fpn.n6.bottleneck.0.cv2.bn.running_var']));
    const buf_557 = createTexture(gl, 153600.0, false);;
    const buf_558 = createTexture(gl, 98304.0, false);;
    const buf_559 = createTexture(gl, 98304.0, true, getTensorBuffer(safetensor, metadata['fpn.n6.cv2.conv.weight']));
    const buf_560 = createTexture(gl, 256.0, false);;
    const buf_561 = createTexture(gl, 256.0, true, getTensorBuffer(safetensor, metadata['fpn.n6.cv2.bn.running_mean']));
    const buf_562 = createTexture(gl, 256.0, false);;
    const buf_563 = createTexture(gl, 256.0, true, getTensorBuffer(safetensor, metadata['fpn.n6.cv2.bn.weight']));
    const buf_564 = createTexture(gl, 256.0, false);;
    const buf_565 = createTexture(gl, 256.0, true, getTensorBuffer(safetensor, metadata['fpn.n6.cv2.bn.bias']));
    const buf_566 = createTexture(gl, 102400.0, false);;
    const buf_567 = createTexture(gl, 256.0, true, getTensorBuffer(safetensor, metadata['fpn.n6.cv2.bn.running_var']));
    const buf_568 = createTexture(gl, 147456.0, false);;
    const buf_569 = createTexture(gl, 147456.0, true, getTensorBuffer(safetensor, metadata['head.cv2.2.0.conv.weight']));
    const buf_570 = createTexture(gl, 64.0, false);;
    const buf_571 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['head.cv2.2.0.bn.running_mean']));
    const buf_572 = createTexture(gl, 64.0, false);;
    const buf_573 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['head.cv2.2.0.bn.weight']));
    const buf_574 = createTexture(gl, 64.0, false);;
    const buf_575 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['head.cv2.2.0.bn.bias']));
    const buf_576 = createTexture(gl, 25600.0, false);;
    const buf_577 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['head.cv2.2.0.bn.running_var']));
    const buf_578 = createTexture(gl, 36864.0, false);;
    const buf_579 = createTexture(gl, 36864.0, true, getTensorBuffer(safetensor, metadata['head.cv2.2.1.conv.weight']));
    const buf_580 = createTexture(gl, 64.0, false);;
    const buf_581 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['head.cv2.2.1.bn.running_mean']));
    const buf_582 = createTexture(gl, 64.0, false);;
    const buf_583 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['head.cv2.2.1.bn.weight']));
    const buf_584 = createTexture(gl, 64.0, false);;
    const buf_585 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['head.cv2.2.1.bn.bias']));
    const buf_586 = createTexture(gl, 25600.0, false);;
    const buf_587 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['head.cv2.2.1.bn.running_var']));
    const buf_588 = createTexture(gl, 4096.0, false);;
    const buf_589 = createTexture(gl, 4096.0, true, getTensorBuffer(safetensor, metadata['head.cv2.2.2.weight']));
    const buf_590 = createTexture(gl, 64.0, false);;
    const buf_591 = createTexture(gl, 64.0, true, getTensorBuffer(safetensor, metadata['head.cv2.2.2.bias']));
    const buf_592 = createTexture(gl, 25600.0, false);;
    const buf_593 = createTexture(gl, 184320.0, false);;
    const buf_594 = createTexture(gl, 184320.0, true, getTensorBuffer(safetensor, metadata['head.cv3.2.0.conv.weight']));
    const buf_595 = createTexture(gl, 80.0, false);;
    const buf_596 = createTexture(gl, 80.0, true, getTensorBuffer(safetensor, metadata['head.cv3.2.0.bn.running_mean']));
    const buf_597 = createTexture(gl, 80.0, false);;
    const buf_598 = createTexture(gl, 80.0, true, getTensorBuffer(safetensor, metadata['head.cv3.2.0.bn.weight']));
    const buf_599 = createTexture(gl, 80.0, false);;
    const buf_600 = createTexture(gl, 80.0, true, getTensorBuffer(safetensor, metadata['head.cv3.2.0.bn.bias']));
    const buf_601 = createTexture(gl, 32000.0, false);;
    const buf_602 = createTexture(gl, 80.0, true, getTensorBuffer(safetensor, metadata['head.cv3.2.0.bn.running_var']));
    const buf_603 = createTexture(gl, 57600.0, false);;
    const buf_604 = createTexture(gl, 57600.0, true, getTensorBuffer(safetensor, metadata['head.cv3.2.1.conv.weight']));
    const buf_605 = createTexture(gl, 80.0, false);;
    const buf_606 = createTexture(gl, 80.0, true, getTensorBuffer(safetensor, metadata['head.cv3.2.1.bn.running_mean']));
    const buf_607 = createTexture(gl, 80.0, false);;
    const buf_608 = createTexture(gl, 80.0, true, getTensorBuffer(safetensor, metadata['head.cv3.2.1.bn.weight']));
    const buf_609 = createTexture(gl, 80.0, false);;
    const buf_610 = createTexture(gl, 80.0, true, getTensorBuffer(safetensor, metadata['head.cv3.2.1.bn.bias']));
    const buf_611 = createTexture(gl, 32000.0, false);;
    const buf_612 = createTexture(gl, 80.0, true, getTensorBuffer(safetensor, metadata['head.cv3.2.1.bn.running_var']));
    const buf_613 = createTexture(gl, 6400.0, false);;
    const buf_614 = createTexture(gl, 6400.0, true, getTensorBuffer(safetensor, metadata['head.cv3.2.2.weight']));
    const buf_615 = createTexture(gl, 80.0, false);;
    const buf_616 = createTexture(gl, 80.0, true, getTensorBuffer(safetensor, metadata['head.cv3.2.2.bias']));
    const buf_617 = createTexture(gl, 32000.0, false);;
    const buf_618 = createTexture(gl, 33600.0, false);;
    const buf_619 = createTexture(gl, 33600.0, false);;
    const buf_620 = createTexture(gl, 16.0, false);;
    const buf_621 = createTexture(gl, 16.0, true, getTensorBuffer(safetensor, metadata['head.dfl.conv.weight']));
    const buf_622 = createTexture(gl, 33600.0, false);;
    const buf_623 = createTexture(gl, 16800.0, false);;
    const buf_624 = createTexture(gl, 16800.0, false);;
    const buf_625 = createTexture(gl, 8400.0, false);;
    const buf_626 = createTexture(gl, 33600.0, false);;
    const buf_627 = createTexture(gl, 672000.0, false);;
    const output0 = createTexture(gl, 705600.0, false);;
let programs = [r_80_20_4, r_80_20_4, r_40_10_4, r_40_10_4, r_20_20, r_20_20, E_432, E_16, E_16, E_16, r_1638400_3_3_3, E_4608, E_32, E_32, E_32, r_819200_16_3_3, E_1024, E_32, E_32, E_32, r_819200_32, E_2304, E_16, E_16, E_16, r_409600_16_3_3, E_2304, E_16, E_16, E_16, r_409600_16_3_3n1, E_1228800n1, E_1536, E_32, E_32, E_32, r_819200_12_4, E_18432, E_64, E_64, E_64, r_409600_32_3_3, E_4096, E_64, E_64, E_64, r_409600_16_4, E_9216, E_32, E_32, E_32, r_204800_32_3_3, E_9216, E_32, E_32, E_32, r_204800_32_3_3n1, E_9216, E_32, E_32, E_32, r_204800_32_3_3n2, E_9216, E_32, E_32, E_32, r_204800_32_3_3n3, E_819200, E_8192, E_64, E_64, E_64, r_409600_32_4, E_73728, E_128, E_128, E_128, r_204800_64_3_3, E_16384, E_128, E_128, E_128, r_204800_32_4, E_36864, E_64, E_64, E_64, r_102400_64_3_3, E_36864, E_64, E_64, E_64, r_102400_64_3_3n1, E_36864, E_64, E_64, E_64, r_102400_64_3_3n2, E_36864, E_64, E_64, E_64, r_102400_64_3_3n3, E_409600, E_32768, E_128, E_128, E_128, r_204800_64_4, E_294912, E_256, E_256, E_256, r_102400_128_3_3, E_65536, E_256, E_256, E_256, r_102400_64_4, E_147456, E_128, E_128, E_128, r_51200_128_3_3, E_147456, E_128, E_128, E_128, r_51200_128_3_3n1, E_153600, E_98304, E_256, E_256, E_256, r_102400_96_4, E_32768, E_128, E_128, E_128, r_51200_64_4, r_51200_5_5, r_51200_5_5, r_51200_5_5, E_204800, E_131072, E_256, E_256, E_256, r_102400_128_4, E_409600n1, E_614400, E_49152, E_128, E_128, E_128, r_204800_96_4, E_36864, E_64, E_64, E_64, r_102400_64_3_3, E_36864, E_64, E_64, E_64, r_102400_64_3_3n2, E_307200, E_24576, E_128, E_128, E_128, r_204800_48_4, E_819200n1, E_1228800n2, E_12288, E_64, E_64, E_64, r_409600_48_4, E_9216, E_32, E_32, E_32, r_204800_32_3_3, E_9216, E_32, E_32, E_32, r_204800_32_3_3n2, E_614400n1, E_6144, E_64, E_64, E_64, r_409600_24_4, E_36864, E_64, E_64, E_64, r_409600_64_3_3, E_36864, E_64, E_64, E_64, r_409600_64_3_3, E_4096, E_64, r_409600_16_4n1, E_46080, E_80, E_80, E_80, r_512000_64_3_3, E_57600, E_80, E_80, E_80, r_512000_80_3_3, E_6400, E_80, r_512000_20_4, E_36864, E_64, E_64, E_64, r_102400_64_3_3n4, E_307200n1, E_24576, E_128, E_128, E_128, r_204800_48_4, E_36864, E_64, E_64, E_64, r_102400_64_3_3, E_36864, E_64, E_64, E_64, r_102400_64_3_3n2, E_307200, E_24576, E_128, E_128, E_128, r_204800_48_4, E_73728n1, E_64, E_64, E_64, r_102400_128_3_3n1, E_36864, E_64, E_64, E_64, r_102400_64_3_3n2, E_4096, E_64, r_102400_16_4, E_92160, E_80, E_80, E_80, r_128000_128_3_3, E_57600, E_80, E_80, E_80, r_128000_80_3_3, E_6400, E_80, r_128000_20_4, E_147456, E_128, E_128, E_128, r_51200_128_3_3n2, E_153600n1, E_98304, E_256, E_256, E_256, r_102400_96_4, E_147456, E_128, E_128, E_128, r_51200_128_3_3, E_147456, E_128, E_128, E_128, r_51200_128_3_3n3, E_153600, E_98304, E_256, E_256, E_256, r_102400_96_4, E_147456n1, E_64, E_64, E_64, r_25600_256_3_3, E_36864, E_64, E_64, E_64, r_25600_64_3_3, E_4096, E_64, r_25600_16_4, E_184320, E_80, E_80, E_80, r_32000_256_3_3, E_57600, E_80, E_80, E_80, r_32000_80_3_3, E_6400, E_80, r_32000_20_4, r_33600_16, r_33600_16n1, E_16n1, r_33600_16n2, E_16800, E_16800n1, E_8400, E_33600, E_672000, E_705600].map((code) => createShaderProgram(gl, code));

    return function(_input0) {
      const ext = gl.getExtension('EXT_color_buffer_float');
      updateTextureData(gl, input0, _input0, false);
      runProgram(gl, 'r_80_20_4', programs[0], [buf_0]);
        runProgram(gl, 'r_80_20_4', programs[1], [buf_1]);
        runProgram(gl, 'r_40_10_4', programs[2], [buf_2]);
        runProgram(gl, 'r_40_10_4', programs[3], [buf_3]);
        runProgram(gl, 'r_20_20', programs[4], [buf_4]);
        runProgram(gl, 'r_20_20', programs[5], [buf_5]);
        runProgram(gl, 'E_432', programs[6], [buf_6, buf_7]);
        runProgram(gl, 'E_16', programs[7], [buf_8, buf_9]);
        runProgram(gl, 'E_16', programs[8], [buf_10, buf_11]);
        runProgram(gl, 'E_16', programs[9], [buf_12, buf_13]);
        runProgram(gl, 'r_1638400_3_3_3', programs[10], [buf_14, input0, buf_6, buf_8, buf_10, buf_15, buf_12]);
        runProgram(gl, 'E_4608', programs[11], [buf_16, buf_17]);
        runProgram(gl, 'E_32', programs[12], [buf_18, buf_19]);
        runProgram(gl, 'E_32', programs[13], [buf_20, buf_21]);
        runProgram(gl, 'E_32', programs[14], [buf_22, buf_23]);
        runProgram(gl, 'r_819200_16_3_3', programs[15], [buf_24, buf_14, buf_16, buf_18, buf_20, buf_25, buf_22]);
        runProgram(gl, 'E_1024', programs[16], [buf_26, buf_27]);
        runProgram(gl, 'E_32', programs[17], [buf_28, buf_29]);
        runProgram(gl, 'E_32', programs[18], [buf_30, buf_31]);
        runProgram(gl, 'E_32', programs[19], [buf_18, buf_32]);
        runProgram(gl, 'r_819200_32', programs[20], [buf_33, buf_24, buf_26, buf_28, buf_30, buf_34, buf_18]);
        runProgram(gl, 'E_2304', programs[21], [buf_35, buf_36]);
        runProgram(gl, 'E_16', programs[22], [buf_37, buf_38]);
        runProgram(gl, 'E_16', programs[23], [buf_39, buf_40]);
        runProgram(gl, 'E_16', programs[24], [buf_41, buf_42]);
        runProgram(gl, 'r_409600_16_3_3', programs[25], [buf_43, buf_33, buf_35, buf_37, buf_39, buf_44, buf_41]);
        runProgram(gl, 'E_2304', programs[26], [buf_45, buf_46]);
        runProgram(gl, 'E_16', programs[27], [buf_47, buf_48]);
        runProgram(gl, 'E_16', programs[28], [buf_49, buf_50]);
        runProgram(gl, 'E_16', programs[29], [buf_51, buf_52]);
        runProgram(gl, 'r_409600_16_3_3n1', programs[30], [buf_53, buf_33, buf_43, buf_45, buf_47, buf_49, buf_54, buf_51]);
        runProgram(gl, 'E_1228800n1', programs[31], [buf_55, buf_33, buf_53]);
        runProgram(gl, 'E_1536', programs[32], [buf_56, buf_57]);
        runProgram(gl, 'E_32', programs[33], [buf_58, buf_59]);
        runProgram(gl, 'E_32', programs[34], [buf_60, buf_61]);
        runProgram(gl, 'E_32', programs[35], [buf_62, buf_63]);
        runProgram(gl, 'r_819200_12_4', programs[36], [buf_64, buf_55, buf_56, buf_58, buf_60, buf_65, buf_62]);
        runProgram(gl, 'E_18432', programs[37], [buf_66, buf_67]);
        runProgram(gl, 'E_64', programs[38], [buf_68, buf_69]);
        runProgram(gl, 'E_64', programs[39], [buf_70, buf_71]);
        runProgram(gl, 'E_64', programs[40], [buf_72, buf_73]);
        runProgram(gl, 'r_409600_32_3_3', programs[41], [buf_74, buf_64, buf_66, buf_68, buf_70, buf_75, buf_72]);
        runProgram(gl, 'E_4096', programs[42], [buf_76, buf_77]);
        runProgram(gl, 'E_64', programs[43], [buf_78, buf_79]);
        runProgram(gl, 'E_64', programs[44], [buf_80, buf_81]);
        runProgram(gl, 'E_64', programs[45], [buf_82, buf_83]);
        runProgram(gl, 'r_409600_16_4', programs[46], [buf_84, buf_74, buf_76, buf_78, buf_80, buf_85, buf_82]);
        runProgram(gl, 'E_9216', programs[47], [buf_86, buf_87]);
        runProgram(gl, 'E_32', programs[48], [buf_88, buf_89]);
        runProgram(gl, 'E_32', programs[49], [buf_90, buf_91]);
        runProgram(gl, 'E_32', programs[50], [buf_92, buf_93]);
        runProgram(gl, 'r_204800_32_3_3', programs[51], [buf_94, buf_84, buf_86, buf_88, buf_90, buf_95, buf_92]);
        runProgram(gl, 'E_9216', programs[52], [buf_96, buf_97]);
        runProgram(gl, 'E_32', programs[53], [buf_98, buf_99]);
        runProgram(gl, 'E_32', programs[54], [buf_100, buf_101]);
        runProgram(gl, 'E_32', programs[55], [buf_92, buf_102]);
        runProgram(gl, 'r_204800_32_3_3n1', programs[56], [buf_103, buf_84, buf_94, buf_96, buf_98, buf_100, buf_104, buf_92]);
        runProgram(gl, 'E_9216', programs[57], [buf_105, buf_106]);
        runProgram(gl, 'E_32', programs[58], [buf_107, buf_108]);
        runProgram(gl, 'E_32', programs[59], [buf_109, buf_110]);
        runProgram(gl, 'E_32', programs[60], [buf_111, buf_112]);
        runProgram(gl, 'r_204800_32_3_3n2', programs[61], [buf_113, buf_103, buf_105, buf_107, buf_109, buf_114, buf_111]);
        runProgram(gl, 'E_9216', programs[62], [buf_96, buf_115]);
        runProgram(gl, 'E_32', programs[63], [buf_107, buf_116]);
        runProgram(gl, 'E_32', programs[64], [buf_117, buf_118]);
        runProgram(gl, 'E_32', programs[65], [buf_119, buf_120]);
        runProgram(gl, 'r_204800_32_3_3n3', programs[66], [buf_121, buf_103, buf_113, buf_96, buf_107, buf_117, buf_122, buf_119]);
        runProgram(gl, 'E_819200', programs[67], [buf_123, buf_84, buf_103, buf_121]);
        runProgram(gl, 'E_8192', programs[68], [buf_124, buf_125]);
        runProgram(gl, 'E_64', programs[69], [buf_126, buf_127]);
        runProgram(gl, 'E_64', programs[70], [buf_128, buf_129]);
        runProgram(gl, 'E_64', programs[71], [buf_130, buf_131]);
        runProgram(gl, 'r_409600_32_4', programs[72], [buf_132, buf_123, buf_124, buf_126, buf_128, buf_133, buf_130]);
        runProgram(gl, 'E_73728', programs[73], [buf_134, buf_135]);
        runProgram(gl, 'E_128', programs[74], [buf_136, buf_137]);
        runProgram(gl, 'E_128', programs[75], [buf_138, buf_139]);
        runProgram(gl, 'E_128', programs[76], [buf_140, buf_141]);
        runProgram(gl, 'r_204800_64_3_3', programs[77], [buf_142, buf_132, buf_134, buf_136, buf_138, buf_143, buf_140]);
        runProgram(gl, 'E_16384', programs[78], [buf_144, buf_145]);
        runProgram(gl, 'E_128', programs[79], [buf_146, buf_147]);
        runProgram(gl, 'E_128', programs[80], [buf_148, buf_149]);
        runProgram(gl, 'E_128', programs[81], [buf_150, buf_151]);
        runProgram(gl, 'r_204800_32_4', programs[82], [buf_152, buf_142, buf_144, buf_146, buf_148, buf_153, buf_150]);
        runProgram(gl, 'E_36864', programs[83], [buf_154, buf_155]);
        runProgram(gl, 'E_64', programs[84], [buf_156, buf_157]);
        runProgram(gl, 'E_64', programs[85], [buf_158, buf_159]);
        runProgram(gl, 'E_64', programs[86], [buf_160, buf_161]);
        runProgram(gl, 'r_102400_64_3_3', programs[87], [buf_162, buf_152, buf_154, buf_156, buf_158, buf_163, buf_160]);
        runProgram(gl, 'E_36864', programs[88], [buf_164, buf_165]);
        runProgram(gl, 'E_64', programs[89], [buf_166, buf_167]);
        runProgram(gl, 'E_64', programs[90], [buf_168, buf_169]);
        runProgram(gl, 'E_64', programs[91], [buf_170, buf_171]);
        runProgram(gl, 'r_102400_64_3_3n1', programs[92], [buf_172, buf_152, buf_162, buf_164, buf_166, buf_168, buf_173, buf_170]);
        runProgram(gl, 'E_36864', programs[93], [buf_174, buf_175]);
        runProgram(gl, 'E_64', programs[94], [buf_176, buf_177]);
        runProgram(gl, 'E_64', programs[95], [buf_178, buf_179]);
        runProgram(gl, 'E_64', programs[96], [buf_180, buf_181]);
        runProgram(gl, 'r_102400_64_3_3n2', programs[97], [buf_182, buf_172, buf_174, buf_176, buf_178, buf_183, buf_180]);
        runProgram(gl, 'E_36864', programs[98], [buf_184, buf_185]);
        runProgram(gl, 'E_64', programs[99], [buf_186, buf_187]);
        runProgram(gl, 'E_64', programs[100], [buf_188, buf_189]);
        runProgram(gl, 'E_64', programs[101], [buf_190, buf_191]);
        runProgram(gl, 'r_102400_64_3_3n3', programs[102], [buf_192, buf_172, buf_182, buf_184, buf_186, buf_188, buf_193, buf_190]);
        runProgram(gl, 'E_409600', programs[103], [buf_194, buf_152, buf_172, buf_192]);
        runProgram(gl, 'E_32768', programs[104], [buf_195, buf_196]);
        runProgram(gl, 'E_128', programs[105], [buf_197, buf_198]);
        runProgram(gl, 'E_128', programs[106], [buf_199, buf_200]);
        runProgram(gl, 'E_128', programs[107], [buf_201, buf_202]);
        runProgram(gl, 'r_204800_64_4', programs[108], [buf_203, buf_194, buf_195, buf_197, buf_199, buf_204, buf_201]);
        runProgram(gl, 'E_294912', programs[109], [buf_205, buf_206]);
        runProgram(gl, 'E_256', programs[110], [buf_207, buf_208]);
        runProgram(gl, 'E_256', programs[111], [buf_209, buf_210]);
        runProgram(gl, 'E_256', programs[112], [buf_211, buf_212]);
        runProgram(gl, 'r_102400_128_3_3', programs[113], [buf_213, buf_203, buf_205, buf_207, buf_209, buf_214, buf_211]);
        runProgram(gl, 'E_65536', programs[114], [buf_215, buf_216]);
        runProgram(gl, 'E_256', programs[115], [buf_217, buf_218]);
        runProgram(gl, 'E_256', programs[116], [buf_219, buf_220]);
        runProgram(gl, 'E_256', programs[117], [buf_221, buf_222]);
        runProgram(gl, 'r_102400_64_4', programs[118], [buf_223, buf_213, buf_215, buf_217, buf_219, buf_224, buf_221]);
        runProgram(gl, 'E_147456', programs[119], [buf_225, buf_226]);
        runProgram(gl, 'E_128', programs[120], [buf_227, buf_228]);
        runProgram(gl, 'E_128', programs[121], [buf_229, buf_230]);
        runProgram(gl, 'E_128', programs[122], [buf_231, buf_232]);
        runProgram(gl, 'r_51200_128_3_3', programs[123], [buf_233, buf_223, buf_225, buf_227, buf_229, buf_234, buf_231]);
        runProgram(gl, 'E_147456', programs[124], [buf_235, buf_236]);
        runProgram(gl, 'E_128', programs[125], [buf_237, buf_238]);
        runProgram(gl, 'E_128', programs[126], [buf_239, buf_240]);
        runProgram(gl, 'E_128', programs[127], [buf_241, buf_242]);
        runProgram(gl, 'r_51200_128_3_3n1', programs[128], [buf_243, buf_223, buf_233, buf_235, buf_237, buf_239, buf_244, buf_241]);
        runProgram(gl, 'E_153600', programs[129], [buf_245, buf_223, buf_243]);
        runProgram(gl, 'E_98304', programs[130], [buf_246, buf_247]);
        runProgram(gl, 'E_256', programs[131], [buf_248, buf_249]);
        runProgram(gl, 'E_256', programs[132], [buf_250, buf_251]);
        runProgram(gl, 'E_256', programs[133], [buf_252, buf_253]);
        runProgram(gl, 'r_102400_96_4', programs[134], [buf_254, buf_245, buf_246, buf_248, buf_250, buf_255, buf_252]);
        runProgram(gl, 'E_32768', programs[135], [buf_256, buf_257]);
        runProgram(gl, 'E_128', programs[136], [buf_258, buf_259]);
        runProgram(gl, 'E_128', programs[137], [buf_260, buf_261]);
        runProgram(gl, 'E_128', programs[138], [buf_262, buf_263]);
        runProgram(gl, 'r_51200_64_4', programs[139], [buf_264, buf_254, buf_256, buf_258, buf_260, buf_265, buf_262]);
        runProgram(gl, 'r_51200_5_5', programs[140], [buf_266, buf_264]);
        runProgram(gl, 'r_51200_5_5', programs[141], [buf_267, buf_266]);
        runProgram(gl, 'r_51200_5_5', programs[142], [buf_268, buf_267]);
        runProgram(gl, 'E_204800', programs[143], [buf_269, buf_264, buf_266, buf_267, buf_268]);
        runProgram(gl, 'E_131072', programs[144], [buf_270, buf_271]);
        runProgram(gl, 'E_256', programs[145], [buf_272, buf_273]);
        runProgram(gl, 'E_256', programs[146], [buf_274, buf_275]);
        runProgram(gl, 'E_256', programs[147], [buf_276, buf_277]);
        runProgram(gl, 'r_102400_128_4', programs[148], [buf_278, buf_269, buf_270, buf_272, buf_274, buf_279, buf_276]);
        runProgram(gl, 'E_409600n1', programs[149], [buf_280, buf_278]);
        runProgram(gl, 'E_614400', programs[150], [buf_281, buf_280, buf_203]);
        runProgram(gl, 'E_49152', programs[151], [buf_282, buf_283]);
        runProgram(gl, 'E_128', programs[152], [buf_284, buf_285]);
        runProgram(gl, 'E_128', programs[153], [buf_286, buf_287]);
        runProgram(gl, 'E_128', programs[154], [buf_288, buf_289]);
        runProgram(gl, 'r_204800_96_4', programs[155], [buf_290, buf_281, buf_282, buf_284, buf_286, buf_291, buf_288]);
        runProgram(gl, 'E_36864', programs[156], [buf_292, buf_293]);
        runProgram(gl, 'E_64', programs[157], [buf_294, buf_295]);
        runProgram(gl, 'E_64', programs[158], [buf_296, buf_297]);
        runProgram(gl, 'E_64', programs[159], [buf_298, buf_299]);
        runProgram(gl, 'r_102400_64_3_3', programs[160], [buf_300, buf_290, buf_292, buf_294, buf_296, buf_301, buf_298]);
        runProgram(gl, 'E_36864', programs[161], [buf_302, buf_303]);
        runProgram(gl, 'E_64', programs[162], [buf_304, buf_305]);
        runProgram(gl, 'E_64', programs[163], [buf_306, buf_307]);
        runProgram(gl, 'E_64', programs[164], [buf_308, buf_309]);
        runProgram(gl, 'r_102400_64_3_3n2', programs[165], [buf_310, buf_300, buf_302, buf_304, buf_306, buf_311, buf_308]);
        runProgram(gl, 'E_307200', programs[166], [buf_312, buf_290, buf_310]);
        runProgram(gl, 'E_24576', programs[167], [buf_313, buf_314]);
        runProgram(gl, 'E_128', programs[168], [buf_315, buf_316]);
        runProgram(gl, 'E_128', programs[169], [buf_317, buf_318]);
        runProgram(gl, 'E_128', programs[170], [buf_319, buf_320]);
        runProgram(gl, 'r_204800_48_4', programs[171], [buf_321, buf_312, buf_313, buf_315, buf_317, buf_322, buf_319]);
        runProgram(gl, 'E_819200n1', programs[172], [buf_323, buf_321]);
        runProgram(gl, 'E_1228800n2', programs[173], [buf_324, buf_323, buf_132]);
        runProgram(gl, 'E_12288', programs[174], [buf_325, buf_326]);
        runProgram(gl, 'E_64', programs[175], [buf_327, buf_328]);
        runProgram(gl, 'E_64', programs[176], [buf_329, buf_330]);
        runProgram(gl, 'E_64', programs[177], [buf_331, buf_332]);
        runProgram(gl, 'r_409600_48_4', programs[178], [buf_333, buf_324, buf_325, buf_327, buf_329, buf_334, buf_331]);
        runProgram(gl, 'E_9216', programs[179], [buf_335, buf_336]);
        runProgram(gl, 'E_32', programs[180], [buf_337, buf_338]);
        runProgram(gl, 'E_32', programs[181], [buf_119, buf_339]);
        runProgram(gl, 'E_32', programs[182], [buf_340, buf_341]);
        runProgram(gl, 'r_204800_32_3_3', programs[183], [buf_342, buf_333, buf_335, buf_337, buf_119, buf_343, buf_340]);
        runProgram(gl, 'E_9216', programs[184], [buf_344, buf_345]);
        runProgram(gl, 'E_32', programs[185], [buf_346, buf_347]);
        runProgram(gl, 'E_32', programs[186], [buf_348, buf_349]);
        runProgram(gl, 'E_32', programs[187], [buf_350, buf_351]);
        runProgram(gl, 'r_204800_32_3_3n2', programs[188], [buf_352, buf_342, buf_344, buf_346, buf_348, buf_353, buf_350]);
        runProgram(gl, 'E_614400n1', programs[189], [buf_354, buf_333, buf_352]);
        runProgram(gl, 'E_6144', programs[190], [buf_355, buf_356]);
        runProgram(gl, 'E_64', programs[191], [buf_357, buf_358]);
        runProgram(gl, 'E_64', programs[192], [buf_359, buf_360]);
        runProgram(gl, 'E_64', programs[193], [buf_361, buf_362]);
        runProgram(gl, 'r_409600_24_4', programs[194], [buf_363, buf_354, buf_355, buf_357, buf_359, buf_364, buf_361]);
        runProgram(gl, 'E_36864', programs[195], [buf_365, buf_366]);
        runProgram(gl, 'E_64', programs[196], [buf_367, buf_368]);
        runProgram(gl, 'E_64', programs[197], [buf_369, buf_370]);
        runProgram(gl, 'E_64', programs[198], [buf_371, buf_372]);
        runProgram(gl, 'r_409600_64_3_3', programs[199], [buf_373, buf_363, buf_365, buf_367, buf_369, buf_374, buf_371]);
        runProgram(gl, 'E_36864', programs[200], [buf_375, buf_376]);
        runProgram(gl, 'E_64', programs[201], [buf_377, buf_378]);
        runProgram(gl, 'E_64', programs[202], [buf_379, buf_380]);
        runProgram(gl, 'E_64', programs[203], [buf_381, buf_382]);
        runProgram(gl, 'r_409600_64_3_3', programs[204], [buf_383, buf_373, buf_375, buf_377, buf_379, buf_384, buf_381]);
        runProgram(gl, 'E_4096', programs[205], [buf_385, buf_386]);
        runProgram(gl, 'E_64', programs[206], [buf_387, buf_388]);
        runProgram(gl, 'r_409600_16_4n1', programs[207], [buf_389, buf_383, buf_385, buf_387]);
        runProgram(gl, 'E_46080', programs[208], [buf_390, buf_391]);
        runProgram(gl, 'E_80', programs[209], [buf_392, buf_393]);
        runProgram(gl, 'E_80', programs[210], [buf_394, buf_395]);
        runProgram(gl, 'E_80', programs[211], [buf_396, buf_397]);
        runProgram(gl, 'r_512000_64_3_3', programs[212], [buf_398, buf_363, buf_390, buf_392, buf_394, buf_399, buf_396]);
        runProgram(gl, 'E_57600', programs[213], [buf_400, buf_401]);
        runProgram(gl, 'E_80', programs[214], [buf_402, buf_403]);
        runProgram(gl, 'E_80', programs[215], [buf_404, buf_405]);
        runProgram(gl, 'E_80', programs[216], [buf_406, buf_407]);
        runProgram(gl, 'r_512000_80_3_3', programs[217], [buf_408, buf_398, buf_400, buf_402, buf_404, buf_409, buf_406]);
        runProgram(gl, 'E_6400', programs[218], [buf_410, buf_411]);
        runProgram(gl, 'E_80', programs[219], [buf_412, buf_413]);
        runProgram(gl, 'r_512000_20_4', programs[220], [buf_414, buf_408, buf_410, buf_412]);
        runProgram(gl, 'E_36864', programs[221], [buf_415, buf_416]);
        runProgram(gl, 'E_64', programs[222], [buf_417, buf_418]);
        runProgram(gl, 'E_64', programs[223], [buf_419, buf_420]);
        runProgram(gl, 'E_64', programs[224], [buf_421, buf_422]);
        runProgram(gl, 'r_102400_64_3_3n4', programs[225], [buf_423, buf_363, buf_415, buf_417, buf_419, buf_424, buf_421]);
        runProgram(gl, 'E_307200n1', programs[226], [buf_425, buf_423, buf_321]);
        runProgram(gl, 'E_24576', programs[227], [buf_426, buf_427]);
        runProgram(gl, 'E_128', programs[228], [buf_428, buf_429]);
        runProgram(gl, 'E_128', programs[229], [buf_430, buf_431]);
        runProgram(gl, 'E_128', programs[230], [buf_432, buf_433]);
        runProgram(gl, 'r_204800_48_4', programs[231], [buf_434, buf_425, buf_426, buf_428, buf_430, buf_435, buf_432]);
        runProgram(gl, 'E_36864', programs[232], [buf_436, buf_437]);
        runProgram(gl, 'E_64', programs[233], [buf_438, buf_439]);
        runProgram(gl, 'E_64', programs[234], [buf_440, buf_441]);
        runProgram(gl, 'E_64', programs[235], [buf_442, buf_443]);
        runProgram(gl, 'r_102400_64_3_3', programs[236], [buf_444, buf_434, buf_436, buf_438, buf_440, buf_445, buf_442]);
        runProgram(gl, 'E_36864', programs[237], [buf_446, buf_447]);
        runProgram(gl, 'E_64', programs[238], [buf_448, buf_449]);
        runProgram(gl, 'E_64', programs[239], [buf_450, buf_451]);
        runProgram(gl, 'E_64', programs[240], [buf_452, buf_453]);
        runProgram(gl, 'r_102400_64_3_3n2', programs[241], [buf_454, buf_444, buf_446, buf_448, buf_450, buf_455, buf_452]);
        runProgram(gl, 'E_307200', programs[242], [buf_456, buf_434, buf_454]);
        runProgram(gl, 'E_24576', programs[243], [buf_457, buf_458]);
        runProgram(gl, 'E_128', programs[244], [buf_459, buf_460]);
        runProgram(gl, 'E_128', programs[245], [buf_461, buf_462]);
        runProgram(gl, 'E_128', programs[246], [buf_463, buf_464]);
        runProgram(gl, 'r_204800_48_4', programs[247], [buf_465, buf_456, buf_457, buf_459, buf_461, buf_466, buf_463]);
        runProgram(gl, 'E_73728n1', programs[248], [buf_467, buf_468]);
        runProgram(gl, 'E_64', programs[249], [buf_469, buf_470]);
        runProgram(gl, 'E_64', programs[250], [buf_471, buf_472]);
        runProgram(gl, 'E_64', programs[251], [buf_473, buf_474]);
        runProgram(gl, 'r_102400_128_3_3n1', programs[252], [buf_475, buf_465, buf_467, buf_469, buf_471, buf_476, buf_473]);
        runProgram(gl, 'E_36864', programs[253], [buf_477, buf_478]);
        runProgram(gl, 'E_64', programs[254], [buf_479, buf_480]);
        runProgram(gl, 'E_64', programs[255], [buf_481, buf_482]);
        runProgram(gl, 'E_64', programs[256], [buf_483, buf_484]);
        runProgram(gl, 'r_102400_64_3_3n2', programs[257], [buf_485, buf_475, buf_477, buf_479, buf_481, buf_486, buf_483]);
        runProgram(gl, 'E_4096', programs[258], [buf_487, buf_488]);
        runProgram(gl, 'E_64', programs[259], [buf_489, buf_490]);
        runProgram(gl, 'r_102400_16_4', programs[260], [buf_491, buf_485, buf_487, buf_489]);
        runProgram(gl, 'E_92160', programs[261], [buf_492, buf_493]);
        runProgram(gl, 'E_80', programs[262], [buf_494, buf_495]);
        runProgram(gl, 'E_80', programs[263], [buf_496, buf_497]);
        runProgram(gl, 'E_80', programs[264], [buf_498, buf_499]);
        runProgram(gl, 'r_128000_128_3_3', programs[265], [buf_500, buf_465, buf_492, buf_494, buf_496, buf_501, buf_498]);
        runProgram(gl, 'E_57600', programs[266], [buf_502, buf_503]);
        runProgram(gl, 'E_80', programs[267], [buf_504, buf_505]);
        runProgram(gl, 'E_80', programs[268], [buf_506, buf_507]);
        runProgram(gl, 'E_80', programs[269], [buf_508, buf_509]);
        runProgram(gl, 'r_128000_80_3_3', programs[270], [buf_510, buf_500, buf_502, buf_504, buf_506, buf_511, buf_508]);
        runProgram(gl, 'E_6400', programs[271], [buf_512, buf_513]);
        runProgram(gl, 'E_80', programs[272], [buf_514, buf_515]);
        runProgram(gl, 'r_128000_20_4', programs[273], [buf_516, buf_510, buf_512, buf_514]);
        runProgram(gl, 'E_147456', programs[274], [buf_517, buf_518]);
        runProgram(gl, 'E_128', programs[275], [buf_519, buf_520]);
        runProgram(gl, 'E_128', programs[276], [buf_521, buf_522]);
        runProgram(gl, 'E_128', programs[277], [buf_523, buf_524]);
        runProgram(gl, 'r_51200_128_3_3n2', programs[278], [buf_525, buf_465, buf_517, buf_519, buf_521, buf_526, buf_523]);
        runProgram(gl, 'E_153600n1', programs[279], [buf_527, buf_525, buf_278]);
        runProgram(gl, 'E_98304', programs[280], [buf_528, buf_529]);
        runProgram(gl, 'E_256', programs[281], [buf_530, buf_531]);
        runProgram(gl, 'E_256', programs[282], [buf_532, buf_533]);
        runProgram(gl, 'E_256', programs[283], [buf_534, buf_535]);
        runProgram(gl, 'r_102400_96_4', programs[284], [buf_536, buf_527, buf_528, buf_530, buf_532, buf_537, buf_534]);
        runProgram(gl, 'E_147456', programs[285], [buf_538, buf_539]);
        runProgram(gl, 'E_128', programs[286], [buf_540, buf_541]);
        runProgram(gl, 'E_128', programs[287], [buf_542, buf_543]);
        runProgram(gl, 'E_128', programs[288], [buf_544, buf_545]);
        runProgram(gl, 'r_51200_128_3_3', programs[289], [buf_546, buf_536, buf_538, buf_540, buf_542, buf_547, buf_544]);
        runProgram(gl, 'E_147456', programs[290], [buf_548, buf_549]);
        runProgram(gl, 'E_128', programs[291], [buf_550, buf_551]);
        runProgram(gl, 'E_128', programs[292], [buf_552, buf_553]);
        runProgram(gl, 'E_128', programs[293], [buf_544, buf_554]);
        runProgram(gl, 'r_51200_128_3_3n3', programs[294], [buf_555, buf_546, buf_548, buf_550, buf_552, buf_556, buf_544]);
        runProgram(gl, 'E_153600', programs[295], [buf_557, buf_536, buf_555]);
        runProgram(gl, 'E_98304', programs[296], [buf_558, buf_559]);
        runProgram(gl, 'E_256', programs[297], [buf_560, buf_561]);
        runProgram(gl, 'E_256', programs[298], [buf_562, buf_563]);
        runProgram(gl, 'E_256', programs[299], [buf_564, buf_565]);
        runProgram(gl, 'r_102400_96_4', programs[300], [buf_566, buf_557, buf_558, buf_560, buf_562, buf_567, buf_564]);
        runProgram(gl, 'E_147456n1', programs[301], [buf_568, buf_569]);
        runProgram(gl, 'E_64', programs[302], [buf_570, buf_571]);
        runProgram(gl, 'E_64', programs[303], [buf_572, buf_573]);
        runProgram(gl, 'E_64', programs[304], [buf_574, buf_575]);
        runProgram(gl, 'r_25600_256_3_3', programs[305], [buf_576, buf_566, buf_568, buf_570, buf_572, buf_577, buf_574]);
        runProgram(gl, 'E_36864', programs[306], [buf_578, buf_579]);
        runProgram(gl, 'E_64', programs[307], [buf_580, buf_581]);
        runProgram(gl, 'E_64', programs[308], [buf_582, buf_583]);
        runProgram(gl, 'E_64', programs[309], [buf_584, buf_585]);
        runProgram(gl, 'r_25600_64_3_3', programs[310], [buf_586, buf_576, buf_578, buf_580, buf_582, buf_587, buf_584]);
        runProgram(gl, 'E_4096', programs[311], [buf_588, buf_589]);
        runProgram(gl, 'E_64', programs[312], [buf_590, buf_591]);
        runProgram(gl, 'r_25600_16_4', programs[313], [buf_592, buf_586, buf_588, buf_590]);
        runProgram(gl, 'E_184320', programs[314], [buf_593, buf_594]);
        runProgram(gl, 'E_80', programs[315], [buf_595, buf_596]);
        runProgram(gl, 'E_80', programs[316], [buf_597, buf_598]);
        runProgram(gl, 'E_80', programs[317], [buf_599, buf_600]);
        runProgram(gl, 'r_32000_256_3_3', programs[318], [buf_601, buf_566, buf_593, buf_595, buf_597, buf_602, buf_599]);
        runProgram(gl, 'E_57600', programs[319], [buf_603, buf_604]);
        runProgram(gl, 'E_80', programs[320], [buf_605, buf_606]);
        runProgram(gl, 'E_80', programs[321], [buf_607, buf_608]);
        runProgram(gl, 'E_80', programs[322], [buf_609, buf_610]);
        runProgram(gl, 'r_32000_80_3_3', programs[323], [buf_611, buf_601, buf_603, buf_605, buf_607, buf_612, buf_609]);
        runProgram(gl, 'E_6400', programs[324], [buf_613, buf_614]);
        runProgram(gl, 'E_80', programs[325], [buf_615, buf_616]);
        runProgram(gl, 'r_32000_20_4', programs[326], [buf_617, buf_611, buf_613, buf_615]);
        runProgram(gl, 'r_33600_16', programs[327], [buf_618, buf_389, buf_414, buf_491, buf_516, buf_592, buf_617]);
        runProgram(gl, 'r_33600_16n1', programs[328], [buf_619, buf_389, buf_414, buf_491, buf_516, buf_592, buf_617, buf_618]);
        runProgram(gl, 'E_16n1', programs[329], [buf_620, buf_621]);
        runProgram(gl, 'r_33600_16n2', programs[330], [buf_622, buf_389, buf_414, buf_491, buf_516, buf_592, buf_617, buf_618, buf_619, buf_620]);
        runProgram(gl, 'E_16800', programs[331], [buf_623, buf_0, buf_1, buf_2, buf_3, buf_4, buf_5, buf_622]);
        runProgram(gl, 'E_16800n1', programs[332], [buf_624, buf_0, buf_1, buf_2, buf_3, buf_4, buf_5, buf_622]);
        runProgram(gl, 'E_8400', programs[333], [buf_625]);
        runProgram(gl, 'E_33600', programs[334], [buf_626, buf_623, buf_624, buf_625]);
        runProgram(gl, 'E_672000', programs[335], [buf_627, buf_389, buf_414, buf_491, buf_516, buf_592, buf_617]);
        runProgram(gl, 'E_705600', programs[336], [output0, buf_626, buf_627]);

      return readTextureData(gl, output0);
    }
  }