#version 300 es
precision highp float;

layout(std140) uniform Mass {
    vec4 massPosition[3];
};

uniform vec2 uResolution;
uniform int uHiddenMasses;
uniform float uAttenuation;

out vec4 fragColor;

void main() {
    float minDist = 10000.0f;
    for(int i = 0; i < 3; i++) {
        vec2 distVec = gl_FragCoord.xy - (massPosition[i].xy + vec2(1.0f, 1.0f)) * uResolution * 0.5f;
        float dist2 = dot(distVec, distVec);
        minDist = min(minDist, dist2);
    }

    if(minDist > 5.0f * 5.0f || uHiddenMasses == 1) {
        // Slightly transparent black
        fragColor = vec4(0.0f, 0.0f, 0.0f, uAttenuation);
    } else {
        // Red color for mass positions
        fragColor = vec4(1.0f, 0.0f, 0.0f, 1.0f);
    }
}
