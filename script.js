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
    this.uPointSize = 1.0;
    this.uMouse = [0.0, 0.0]; // マウス座標用

    this.numOfParticles = 20000;

    this.currentSourceIdx = 1;

    this.frame = 0;

    // tweakpane を初期化
    const pane = new Pane();
    pane
      .addBlade({
        view: "slider",
        label: "number-of-particles",
        step: 1,
        min: 1000,
        max: 20000,
        value: this.numOfParticles,
      })
      .on("change", (v) => {
        this.numOfParticles = v.value;
      });

    // マウス座標用のイベントを設定
    window.addEventListener(
      "pointermove",
      (mouseEvent) => {
        const x = mouseEvent.pageX / window.innerWidth;
        const y = mouseEvent.pageY / window.innerHeight;
        const signedX = x * 2.0 - 1.0;
        const signedY = y * 2.0 - 1.0;

        this.uMouse[0] = signedX;
        this.uMouse[1] = -signedY; // スクリーン空間とは正負が逆
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
      transformFeedbackVaryings: ["tfPosition", "tfVelocity"],
    });

    const massVs = await WebGLUtility.loadFile("./mass.vert");
    const massFs = await WebGLUtility.loadFile("./mass.frag");
    this.massProgram = new ShaderProgram(this.gl, {
      vertexShaderSource: massVs,
      fragmentShaderSource: massFs,
      attribute: ["quad"],
      stride: [2],
    });
  }
  /**
   * WebGL のレンダリングを開始する前のセットアップを行う。
   */
  setup() {
    this.setupGeometry();
    this.setupTransformFeedback();
    this.setupMass();
    this.setupQuadVa();
    this.resize();
    this.gl.clearColor(0.1, 0.1, 0.1, 1.0);
    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
    this.running = true;
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
      gl.enableVertexAttribArray(1); // Assuming 'aColor' is at location 1
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

      // Bind and setup VBO for velocity
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbos[i][2]);
      gl.enableVertexAttribArray(2); // Assuming 'aVelocity' is at location 2
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

    let masses = [];
    for (let i = 0; i < 10; i++) {
      masses.push(
        new Float32Array([
          Math.random() * 2.0 - 1.0,
          Math.random() * 2.0 - 1.0,
          Math.random() * 2.0 - 1.0,
          1 / 200000,
        ])
      );
    }

    const massUniformBuffer = gl.createBuffer();
    gl.bindBuffer(gl.UNIFORM_BUFFER, massUniformBuffer);

    const flattenedMasses = new Float32Array(masses.map((m) => [...m]).flat());

    gl.bufferData(gl.UNIFORM_BUFFER, flattenedMasses, gl.STATIC_DRAW);

    const blockIndex = gl.getUniformBlockIndex(
      this.shaderProgram.program,
      "Masses"
    );
    gl.uniformBlockBinding(this.shaderProgram.program, blockIndex, 0);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, massUniformBuffer);
  }

  setupQuadVa() {
    this.vb = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    this.va = [WebGLUtility.createVbo(this.gl, this.vb)];
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

    // ビューポートの設定と背景のクリア
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // プログラムオブジェクトを指定し、VBO と uniform 変数を設定
    // this.massProgram.use();
    // this.massProgram.setAttribute(this.va);

    // gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    this.shaderProgram.use();

    const tfs = [this.tfA, this.tfB];
    const sourceIndex = this.currentSourceIdx;
    const destIndex = (this.currentSourceIdx + 1) % 2;

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
    this.gl = this.canvas.getContext("webgl2", option);
    if (this.gl == null) {
      throw new Error("webgl2 not supported");
    }
  }
}
