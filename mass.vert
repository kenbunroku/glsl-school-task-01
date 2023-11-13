#version 300 es

layout(location = 0) in vec4 mPosition;

void main() {
    gl_Position = vec4(mPosition.xyz, 1.0f);

    gl_PointSize = 10.0f;
}
