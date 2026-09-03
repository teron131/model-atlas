/** Full-resolution WebGL renderer for the reference Phase Ledger interference material. */

type PhaseShaderModel = {
  agentic: number;
  color: [number, number, number];
  context: number;
  intelligence: number;
  mean: number;
  speed: number;
  value: number;
  x: number;
  y: number;
};

type PhaseShaderPointer = {
  energy: number;
  vx: number;
  vy: number;
  x: number;
  y: number;
};

type PhaseShaderFrame = {
  context: CanvasRenderingContext2D;
  dark: boolean;
  height: number;
  models: PhaseShaderModel[];
  pointer: PhaseShaderPointer;
  time: number;
  width: number;
};

type PhaseRenderer = {
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
};

const renderers = new WeakMap<HTMLCanvasElement, PhaseRenderer | null>();

const VERTEX_SHADER = `
  precision highp float;
  attribute vec2 aPosition;
  varying vec2 vTexCoord;

  void main() {
    vTexCoord = aPosition * 0.5 + 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  precision highp float;
  varying vec2 vTexCoord;
  uniform float uTime;
  uniform vec2 uPoint0;
  uniform vec2 uPoint1;
  uniform vec2 uPoint2;
  uniform vec2 uPoint3;
  uniform vec2 uPoint4;
  uniform vec2 uPoint5;
  uniform vec4 uModel0;
  uniform vec4 uModel1;
  uniform vec4 uModel2;
  uniform vec4 uModel3;
  uniform vec4 uModel4;
  uniform vec4 uModel5;
  uniform vec3 uDynamics0;
  uniform vec3 uDynamics1;
  uniform vec3 uDynamics2;
  uniform vec3 uDynamics3;
  uniform vec3 uDynamics4;
  uniform vec3 uDynamics5;
  uniform vec3 uColor0;
  uniform vec3 uColor1;
  uniform vec3 uColor2;
  uniform vec3 uColor3;
  uniform vec3 uColor4;
  uniform vec3 uColor5;
  uniform float uModelCount;
  uniform float uAspect;
  uniform vec2 uPointer;
  uniform vec2 uPointerVelocity;
  uniform float uPointerEnergy;
  uniform float uDark;

  float localField(vec2 uv, vec2 point, float context) {
    vec2 scale = vec2(0.2 + context * 0.03, 0.17 + context * 0.04);
    vec2 delta = (uv - point) / scale;
    return exp(-(delta.x * delta.x * 1.3 + delta.y * delta.y * 2.1));
  }

  float modelWave(
    vec2 uv,
    vec2 point,
    vec4 model,
    vec3 dynamics
  ) {
    vec2 scale = vec2(0.2 + model.w * 0.03, 0.17 + model.w * 0.04);
    vec2 delta = (uv - point) / scale;
    float local = exp(-(delta.x * delta.x * 1.3 + delta.y * delta.y * 2.1));
    float wavelength = 7.5 + (68.0 - model.x) * 1.1;
    float separation = 4.0 + model.y * 5.0;
    float directional = delta.x * wavelength + delta.y * separation;
    float movement = 0.35 + dynamics.x * 0.55;
    float detail = 0.8 + dynamics.y * 0.4;
    float presence = dynamics.z;
    return sin(directional + uTime * movement) *
      local *
      model.z *
      presence *
      detail;
  }

  void main() {
    vec2 uv = vec2(vTexCoord.x, 1.0 - vTexCoord.y);
    vec2 pointerDelta = uv - uPointer;
    pointerDelta.x *= uAspect;
    float pointerDistance = length(pointerDelta);
    float pointerRadius = 0.14;
    float pointerWave = 0.0;
    float pointerStrength = 0.0;
    vec2 pointerWarp = vec2(0.0);
    if (
      uPointerEnergy >= 0.002 &&
      pointerDistance < pointerRadius * 2.0
    ) {
      vec2 pointerDirection = pointerDelta / max(pointerDistance, 0.001);
      float pointerFalloff = exp(
        -pow(pointerDistance / pointerRadius, 2.0) * 2.7
      );
      pointerWave = sin(
        pointerDistance / pointerRadius * 6.2831853 * 3.6 - uTime * 4.2
      );
      vec2 pointerTangent = vec2(-pointerDirection.y, pointerDirection.x);
      vec2 pointerVelocity = vec2(
        uPointerVelocity.x * uAspect,
        uPointerVelocity.y
      );
      pointerStrength = pointerFalloff * uPointerEnergy;
      pointerWarp =
        pointerDirection * pointerWave * 0.024 * pointerStrength +
        pointerTangent *
          dot(pointerVelocity, pointerTangent) *
          0.024 *
          pointerStrength *
          1.8;
    }
    pointerWarp.x /= uAspect;
    uv += pointerWarp;

    float warp =
      sin(uv.x * 13.0 + uTime * 0.2) *
        cos(uv.y * 11.0 - uTime * 0.13) *
        0.5 +
      sin((uv.x + uv.y) * 19.0) * 0.22;
    float phase = uv.x * 23.0 - uv.y * 11.0 + warp * 8.0;
    phase += pointerWave * pointerStrength * 3.4;
    phase +=
      modelWave(uv, uPoint0, uModel0, uDynamics0) +
      modelWave(uv, uPoint1, uModel1, uDynamics1) +
      modelWave(uv, uPoint2, uModel2, uDynamics2);
    if (uModelCount > 3.5) {
      phase += modelWave(uv, uPoint3, uModel3, uDynamics3);
    }
    if (uModelCount > 4.5) {
      phase += modelWave(uv, uPoint4, uModel4, uDynamics4);
    }
    if (uModelCount > 5.5) {
      phase += modelWave(uv, uPoint5, uModel5, uDynamics5);
    }
    phase += sin(uv.x * 31.0 + uv.y * 17.0 - uTime * 0.32) * 0.65;

    float local0 = localField(uv, uPoint0, uModel0.w);
    float local1 = localField(uv, uPoint1, uModel1.w);
    float local2 = localField(uv, uPoint2, uModel2.w);
    float local3 = 0.0;
    float local4 = 0.0;
    float local5 = 0.0;
    if (uModelCount > 3.5) {
      local3 = localField(uv, uPoint3, uModel3.w);
    }
    if (uModelCount > 4.5) {
      local4 = localField(uv, uPoint4, uModel4.w);
    }
    if (uModelCount > 5.5) {
      local5 = localField(uv, uPoint5, uModel5.w);
    }
    float weight0 = pow(local0, 0.78);
    float weight1 = pow(local1, 0.78);
    float weight2 = pow(local2, 0.78);
    float weight3 = pow(local3, 0.78);
    float weight4 = pow(local4, 0.78);
    float weight5 = pow(local5, 0.78);
    float weightSum = max(
      weight0 + weight1 + weight2 + weight3 + weight4 + weight5,
      0.00001
    );
    vec3 provider = (
      uColor0 * weight0 +
      uColor1 * weight1 +
      uColor2 * weight2 +
      uColor3 * weight3 +
      uColor4 * weight4 +
      uColor5 * weight5
    ) / weightSum;
    float presenceGain = (
      uDynamics0.z * weight0 +
      uDynamics1.z * weight1 +
      uDynamics2.z * weight2 +
      uDynamics3.z * weight3 +
      uDynamics4.z * weight4 +
      uDynamics5.z * weight5
    ) / weightSum;
    float detail = (
      uDynamics0.y * weight0 +
      uDynamics1.y * weight1 +
      uDynamics2.y * weight2 +
      uDynamics3.y * weight3 +
      uDynamics4.y * weight4 +
      uDynamics5.y * weight5
    ) / weightSum;
    float strongest = max(
      max(max(local0, local1), max(local2, local3)),
      max(local4, local5)
    );

    float wave = abs(sin(phase));
    float shoulder = smoothstep(0.91, 0.965, wave);
    float core = smoothstep(0.975, 0.997, wave);
    float haze =
      0.1 +
      (
        sin(
          uv.x * (31.0 + detail * 12.0) +
          uv.y * (25.0 + detail * 8.0) +
          uTime * 0.21
        ) +
        1.0
      ) *
      0.035;
    float base =
      (8.0 + haze * 16.0 + shoulder * 20.0 + core * 168.0) / 255.0;
    float tint =
      (shoulder * 0.035 + core * 0.48) *
      (0.5 + strongest * 0.5) *
      presenceGain;
    vec3 darkNeutral = vec3(base, base + 4.0 / 255.0, base + 10.0 / 255.0);
    vec3 lightNeutral = vec3(
      1.0 - base * 0.72,
      1.0 - base * 0.68,
      1.0 - base * 0.75
    );
    vec3 neutral = mix(lightNeutral, darkNeutral, uDark);
    vec3 color = mix(neutral, provider, tint);
    float vignette = 1.0 - distance(uv, vec2(0.58, 0.48)) * 0.08;
    gl_FragColor = vec4(clamp(color * vignette, 0.0, 1.0), 1.0);
  }
`;

export function renderPhaseShader(frame: PhaseShaderFrame): boolean {
  const renderer = phaseRenderer(frame.context.canvas);
  if (renderer == null) {
    return false;
  }

  try {
    const { canvas, gl, program, uniforms } = renderer;
    const physicalWidth = frame.context.canvas.width;
    const physicalHeight = frame.context.canvas.height;
    if (canvas.width !== physicalWidth || canvas.height !== physicalHeight) {
      canvas.width = physicalWidth;
      canvas.height = physicalHeight;
    }

    const models = shaderModels(frame.models);
    gl.viewport(0, 0, physicalWidth, physicalHeight);
    gl.useProgram(program);
    gl.uniform1f(uniformLocation(uniforms, "uTime"), frame.time);
    gl.uniform1f(uniformLocation(uniforms, "uAspect"), frame.width / frame.height);
    gl.uniform1f(uniformLocation(uniforms, "uPointerEnergy"), frame.pointer.energy);
    gl.uniform1f(uniformLocation(uniforms, "uDark"), frame.dark ? 1 : 0);
    gl.uniform1f(uniformLocation(uniforms, "uModelCount"), frame.models.length);
    gl.uniform2f(
      uniformLocation(uniforms, "uPointer"),
      frame.pointer.x / Math.max(1, frame.width),
      frame.pointer.y / Math.max(1, frame.height),
    );
    gl.uniform2f(
      uniformLocation(uniforms, "uPointerVelocity"),
      frame.pointer.vx / Math.max(1, frame.width),
      frame.pointer.vy / Math.max(1, frame.height),
    );
    models.forEach((model, index) => {
      gl.uniform2f(uniformLocation(uniforms, `uPoint${index}`), model.x, model.y);
      gl.uniform4f(
        uniformLocation(uniforms, `uModel${index}`),
        model.mean * 100,
        model.agentic,
        model.intelligence,
        model.context,
      );
      gl.uniform3f(
        uniformLocation(uniforms, `uDynamics${index}`),
        model.speed,
        model.value,
        index < frame.models.length ? 1 : 0,
      );
      gl.uniform3f(
        uniformLocation(uniforms, `uColor${index}`),
        model.color[0] / 255,
        model.color[1] / 255,
        model.color[2] / 255,
      );
    });
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.flush();

    frame.context.drawImage(canvas, 0, 0, frame.width, frame.height);
    return true;
  } catch {
    renderers.set(frame.context.canvas, null);
    return false;
  }
}

function phaseRenderer(target: HTMLCanvasElement): PhaseRenderer | null {
  if (renderers.has(target)) {
    return renderers.get(target) ?? null;
  }

  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      depth: false,
      powerPreference: "high-performance",
      premultipliedAlpha: false,
      stencil: false,
    });
    if (gl == null) {
      renderers.set(target, null);
      return null;
    }

    const program = createProgram(gl);
    const position = gl.getAttribLocation(program, "aPosition");
    const buffer = gl.createBuffer();
    if (buffer == null || position < 0) {
      gl.deleteProgram(program);
      renderers.set(target, null);
      return null;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const uniformNames = [
      "uTime",
      "uAspect",
      "uPointer",
      "uPointerVelocity",
      "uPointerEnergy",
      "uDark",
      "uModelCount",
      "uPoint0",
      "uPoint1",
      "uPoint2",
      "uPoint3",
      "uPoint4",
      "uPoint5",
      "uModel0",
      "uModel1",
      "uModel2",
      "uModel3",
      "uModel4",
      "uModel5",
      "uDynamics0",
      "uDynamics1",
      "uDynamics2",
      "uDynamics3",
      "uDynamics4",
      "uDynamics5",
      "uColor0",
      "uColor1",
      "uColor2",
      "uColor3",
      "uColor4",
      "uColor5",
    ];
    const uniforms = Object.fromEntries(
      uniformNames.map((name) => [name, gl.getUniformLocation(program, name)]),
    );
    const renderer = { canvas, gl, program, uniforms };
    renderers.set(target, renderer);
    return renderer;
  } catch {
    renderers.set(target, null);
    return null;
  }
}

function createProgram(gl: WebGLRenderingContext): WebGLProgram {
  const program = gl.createProgram();
  if (program == null) {
    throw new Error("Unable to create the Phase Ledger WebGL program.");
  }
  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
  gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Unable to link the Phase Ledger shader: ${gl.getProgramInfoLog(program)}`);
  }
  return program;
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (shader == null) {
    throw new Error("Unable to create a Phase Ledger WebGL shader.");
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`Unable to compile the Phase Ledger shader: ${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}

function shaderModels(
  models: PhaseShaderModel[],
): [
  PhaseShaderModel,
  PhaseShaderModel,
  PhaseShaderModel,
  PhaseShaderModel,
  PhaseShaderModel,
  PhaseShaderModel,
] {
  const empty: PhaseShaderModel = {
    agentic: 0,
    color: [216, 255, 69],
    context: 0,
    intelligence: 0,
    mean: 0,
    speed: 0,
    value: 0,
    x: 2,
    y: 2,
  };
  return [
    models[0] ?? empty,
    models[1] ?? empty,
    models[2] ?? empty,
    models[3] ?? empty,
    models[4] ?? empty,
    models[5] ?? empty,
  ];
}

function uniformLocation(
  uniforms: Record<string, WebGLUniformLocation | null>,
  name: string,
): WebGLUniformLocation {
  const location = uniforms[name];
  if (location == null) {
    throw new Error(`Missing Phase Ledger shader uniform: ${name}`);
  }
  return location;
}
