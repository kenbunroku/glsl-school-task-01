#version 300 es

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aColor;
layout(location = 2) in vec3 aVelocity;

layout(std140) uniform Masses {
  vec4 massPosition[3];
};

uniform float size;

out vec3 tfPosition;
out vec3 tfVelocity;
out vec3 vColor;

void main() {
  vec3 position = aPosition;
  vec3 velocity = aVelocity;
  vec3 acceleration = vec3(0.0f);

  for(int i = 0; i < 3; i++) {
    vec3 massVec = massPosition[i].xyz - position;
    float massGM = massPosition[i].w;
    float r2 = max(0.01f, dot(massVec, massVec));
    acceleration += massGM * normalize(massVec) / r2;
  }

  velocity += acceleration;
  position += velocity;

  tfPosition = position;
  tfVelocity = velocity;

  vColor = aColor;

  gl_PointSize = size;
  gl_Position = vec4(position.xy, 0.0f, 1.0f);
}
