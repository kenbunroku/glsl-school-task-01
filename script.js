import { WebGLUtility, ShaderProgram } from "./lib/webgl.js";
import { Pane } from "./lib/tweakpane-4.0.0.min.js";

window.addEventListener(
  "DOMContentLoaded",
  async () => {
    // WebGLApp クラスの初期化とリサイズ処理の設定
    const app = new WebGLApp();
    window.addEventListener("resize", app.resize, false);
    // アプリケーションのロードと初期化
    app.init("webgl-canvas");
    await app.load();
    // セットアップして描画を開始
    app.setup();
    app.render();
  },
  false
);

class WebGLApp {
  /**
   * @constructor
   */
  constructor() {
    // 汎用的なプロパティ
    this.canvas = null;
    this.gl = null;
    this.running = false;

    // this を固定するためメソッドをバインドする
    this.resize = this.resize.bind(this);
    this.render = this.render.bind(this);

    // uniform 変数用
    const PARAMS = {
      numOfParticles: 10000,
      size: 3.0,
      gravity: 0.00002,
      hiddenMasses: false,
    };
    this.numOfParticles = PARAMS.numOfParticles;
    this.size = PARAMS.size;
    this.gravity = PARAMS.gravity;
    this.hiddenMasses = PARAMS.hiddenMasses;

    this.currentSourceIdx = 1;

    this.pickedIdx = null;

    // tweakpane を初期化
    const pane = new Pane();
    pane
      .addBinding(PARAMS, "numOfParticles", {
        step: 1,
        min: 1000,
        max: 10000,
      })
      .on("change", (v) => {
        this.numOfParticles = v.value;
      });
    pane
      .addBinding(PARAMS, "size", {
        min: 3.0,
        max: 10.0,
      })
      .on("change", (v) => {
        this.size = v.value;
      });
    pane
      .addBinding(PARAMS, "gravity", {
        min: 0.000002,
        max: 0.0001,
      })
      .on("change", (v) => {
        this.gravity = v.value;
      });
    pane.addBinding(PARAMS, "hiddenMasses").on("change", (v) => {
      this.hiddenMasses = v.value;
    });

    // マウス座標用のイベントを設定
    // Move the masses position around with the mouse
    window.addEventListener("pointerdown", (e) => {
      const [x, y] = [e.offsetX, e.offsetY];

      for (let i = 0; i < this.masses.length; i++) {
        let m = this.masses[i];
        let [mx, my] = [
          (m[0] + 1.0) * (this.canvas.width / 2),
          this.canvas.height - (m[1] + 1.0) * (this.canvas.height / 2),
        ];
        let [dx, dy] = [mx - x, my - y];

        // pick up the closest m to the mouse
        if (dx * dx + dy * dy < 25) {
          this.pickedIdx = i;
          break;
        }
      }
    });
    window.addEventListener("pointermove", (e) => {
      if (e.buttons && this.pickedIdx !== null) {
        let [x, y] = [e.offsetX, e.offsetY];
        this.masses[this.pickedIdx][0] = (2 * x) / this.canvas.width - 1.0;
        this.masses[this.pickedIdx][1] =
          (2 * (this.canvas.height - y)) / this.canvas.height - 1.0;
      }
    });
    window.addEventListener("pointerup", (e) => {
      this.pickedIdx = null;
    });

    this.canvas.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault();
        let touch = e.touches[0];
        let [x, y] = [touch.offsetX, touch.offsetY];

        for (let i = 0; i < this.masses.length; i++) {
          let m = this.masses[i];
          let [mx, my] = [
            (m[0] + 1.0) * (this.canvas.width / 2),
            this.canvas.height - (m[1] + 1.0) * (this.canvas.height / 2),
          ];
          let [dx, dy] = [mx - x, my - y];

          // pick up the closest m to the mouse
          if (dx * dx + dy * dy < 100) {
            this.pickedIdx = i;
            break;
          }
        }
      },
      false
    );
    this.canvas.addEventListener(
      "touchmove",
      (e) => {
        e.preventDefault();
        if (this.pickedIdx !== undefined) {
          let touch = e.touches[0];
          let [x, y] = [touch.offsetX, touch.offsetY];
          this.masses[this.pickedIdx][0] = (2 * x) / this.canvas.width - 1.0;
          this.masses[this.pickedIdx][1] =
            (2 * (this.canvas.height - y)) / this.canvas.height - 1.0;
        }
      },
      false
    );
    this.canvas.addEventListener(
      "touchend",
      () => {
        e.preventDefault();
        this.pickedIdx = undefined;
      },
      false
    );
  }
  /**
   * シェーダやテクスチャ用の画像など非同期で読み込みする処理を行う。
   * @return {Promise}
   */
  async load() {
    const vs = await WebGLUtility.loadFile("./main.vert");
    const fs = await WebGLUtility.loadFile("./main.frag");
    this.shaderProgram = new ShaderProgram(this.gl, {
      vertexShaderSource: vs,
      fragmentShaderSource: fs,
      attribute: ["aPosition", "aColor", "aVelocity"],
      stride: [3, 3, 3],
      uniform: ["size"],
      type: ["uniform1f"],
      transformFeedbackVaryings: ["tfPosition", "tfVelocity"],
    });

    const massVs = await WebGLUtility.loadFile("./mass.vert");
    const massFs = await WebGLUtility.loadFile("./mass.frag");
    this.massProgram = new ShaderProgram(this.gl, {
      vertexShaderSource: massVs,
      fragmentShaderSource: massFs,
      attribute: ["mPosition"],
      stride: [4],
    });
  }
  /**
   * WebGL のレンダリングを開始する前のセットアップを行う。
   */
  setup() {
    this.setupGeometry();
    this.setupTransformFeedback();
    this.setupMass();
    this.setupMassDraw();
    this.resize();
    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
    this.gl.clearColor(0.0, 0.0, 0.0, 1.0);
    this.running = true;
    // Inside the WebGLApp constructor or init method
    this.maxTFComponents = this.gl.getParameter(
      this.gl.MAX_TRANSFORM_FEEDBACK_INTERLEAVED_COMPONENTS
    );
  }
  /**
   * ジオメトリ（頂点情報）を構築するセットアップを行う。
   */
  setupGeometry() {
    const gl = this.gl;

    this.position = new Float32Array(this.numOfParticles * 3);
    this.color = new Float32Array(this.numOfParticles * 3);
    this.velocity = new Float32Array(this.numOfParticles * 3);

    for (let i = 0; i < this.numOfParticles; ++i) {
      let i3 = i * 3;

      this.position[i3 + 0] = Math.random() * 2.0 - 1.0;
      this.position[i3 + 1] = Math.random() * 2.0 - 1.0;
      this.position[i3 + 2] = Math.random() * 2.0 - 1.0;

      this.color[i3 + 0] = Math.random();
      this.color[i3 + 1] = Math.random();
      this.color[i3 + 2] = Math.random();

      this.velocity[i3 + 0] = 0.0;
      this.velocity[i3 + 1] = 0.0;
      this.velocity[i3 + 2] = 0.0;
    }

    this.vboA = [
      WebGLUtility.createVbo(this.gl, this.position),
      WebGLUtility.createVbo(this.gl, this.color),
      WebGLUtility.createVbo(this.gl, this.velocity),
    ];

    this.vboB = [
      WebGLUtility.createVbo(this.gl, this.position),
      WebGLUtility.createVbo(this.gl, this.color),
      WebGLUtility.createVbo(this.gl, this.velocity),
    ];

    this.vbos = [this.vboA, this.vboB];
    this.vaos = [0, 0];

    this.vaos = this.vaos.map((d, i) => {
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);

      // Bind and setup VBO for position
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbos[i][0]);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

      // Bind and setup VBO for color
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbos[i][1]);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

      // Bind and setup VBO for velocity
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbos[i][2]);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 0, 0);

      gl.bindVertexArray(null);

      return vao;
    });
  }

  setupTransformFeedback() {
    const gl = this.gl;

    this.tfA = gl.createTransformFeedback();
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, this.tfA);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, this.vboA[0]); // position
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 1, this.vboA[2]); // velocity
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);

    this.tfB = gl.createTransformFeedback();
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, this.tfB);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, this.vboB[0]); // position
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 1, this.vboB[2]); // velocity
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
  }

  setupMass() {
    const gl = this.gl;

    this.masses = [];
    for (let i = 0; i < 3; i++) {
      this.masses.push(
        new Float32Array([
          Math.random() * 2.0 - 1.0,
          Math.random() * 2.0 - 1.0,
          Math.random() * 2.0 - 1.0,
          this.gravity,
        ])
      );
    }

    this.massUniformBuffer = gl.createBuffer();
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.massUniformBuffer);

    const flattenedMasses = new Float32Array(
      this.masses.map((m) => [...m]).flat()
    );

    gl.bufferData(gl.UNIFORM_BUFFER, flattenedMasses, gl.STATIC_DRAW);

    // Bind the buffer to the uniform block in the shader program
    const blockIndex = gl.getUniformBlockIndex(
      this.shaderProgram.program,
      "Masses"
    );
    gl.uniformBlockBinding(this.shaderProgram.program, blockIndex, 0);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, this.massUniformBuffer);
  }

  //   setupQuadVa() {
  //     const gl = this.gl;
  //     this.vb = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
  //     this.quadVBO = WebGLUtility.createVbo(this.gl, this.vb);

  //     this.quadVAO = gl.createVertexArray();
  //     gl.bindVertexArray(this.quadVAO);
  //     gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVBO);
  //     gl.enableVertexAttribArray(0);
  //     gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  //     gl.bindVertexArray(null);
  //   }

  setupMassDraw() {
    const gl = this.gl;

    const massPositions = new Float32Array(
      this.masses.map((m) => [...m]).flat()
    );

    // Create VBO for mass positions
    this.massPositionVBO = WebGLUtility.createVbo(gl, massPositions);

    // Create VAO for mass positions
    const massPositionVAO = gl.createVertexArray();
    gl.bindVertexArray(massPositionVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.massPositionVBO);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    // Store VAO for later use
    this.massPositionVAO = massPositionVAO;
  }

  /**
   * WebGL を利用して描画を行う。
   */
  render() {
    const gl = this.gl;

    // running が true の場合は requestAnimationFrame を呼び出す
    if (this.running === true) {
      requestAnimationFrame(this.render);
    }

    for (let i = 0; i < this.masses.length; i++) {
      this.masses[i][3] = this.gravity;
    }
    const updatedMasses = new Float32Array(
      this.masses.map((m) => [...m]).flat()
    );
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.massUniformBuffer);
    gl.bufferData(gl.UNIFORM_BUFFER, updatedMasses, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.UNIFORM_BUFFER, null);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.massPositionVBO);
    gl.bufferData(gl.ARRAY_BUFFER, updatedMasses, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    // ビューポートの設定と背景のクリア
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const tfs = [this.tfA, this.tfB];
    const sourceIndex = this.currentSourceIdx;
    const destIndex = (this.currentSourceIdx + 1) % 2;

    if (!this.hiddenMasses) {
      this.massProgram.use();
      gl.bindVertexArray(this.massPositionVAO);
      const sizeUniformLocation = gl.getUniformLocation(
        this.massProgram.program,
        ["size"]
      );
      gl.uniform1f(sizeUniformLocation, this.size);
      gl.drawArrays(gl.POINTS, 0, this.masses.length);
    }

    this.shaderProgram.use();
    this.shaderProgram.setUniform([this.size]);
    // set up for transform feedback
    gl.bindVertexArray(this.vaos[sourceIndex]);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, tfs[destIndex]);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, this.vbos[destIndex][0]); // position
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 1, this.vbos[destIndex][2]); // velocity

    gl.beginTransformFeedback(gl.POINTS);
    gl.drawArrays(gl.POINTS, 0, this.numOfParticles);
    gl.endTransformFeedback();

    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 1, null);

    this.currentSourceIdx = destIndex;
  }
  /**
   * リサイズ処理を行う。
   */
  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.uResolution = [this.canvas.width, this.canvas.height];
  }
  /**
   * WebGL を実行するための初期化処理を行う。
   * @param {HTMLCanvasElement|string} canvas - canvas への参照か canvas の id 属性名のいずれか
   * @param {object} [option={}] - WebGL コンテキストの初期化オプション
   */
  init(canvas, option = {}) {
    if (canvas instanceof HTMLCanvasElement === true) {
      this.canvas = canvas;
    } else if (Object.prototype.toString.call(canvas) === "[object String]") {
      const c = document.querySelector(`#${canvas}`);
      if (c instanceof HTMLCanvasElement === true) {
        this.canvas = c;
      }
    }
    if (this.canvas == null) {
      throw new Error("invalid argument");
    }
    const contextAttributes = {
      ...option,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    };
    this.gl = this.canvas.getContext("webgl2", contextAttributes);
    if (this.gl == null) {
      throw new Error("webgl2 not supported");
    }
  }
}
