#version 300 es
precision highp float;

in vec3 vColor;

out vec4 fragColor;

void main() {
  float alpha = 0.8f;
  vec2 dist = 2.0f * gl_PointCoord - 1.0f;
  if(dot(dist, dist) > 1.0f)
    discard;
  fragColor = vec4(vColor * alpha, alpha);
}
