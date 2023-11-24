#version 300 es
precision highp float;

layout(std140) uniform Mass {
    vec4 massPosition[3];
};

uniform sampler2D uTexture;
uniform vec2 uResolution;
uniform int uHiddenMasses;
uniform float uOpacity;

out vec4 fragColor;

void main() {
    float minDist = 10000.0f;
    for(int i = 0; i < 3; i++) {
        vec2 distVec = gl_FragCoord.xy - (massPosition[i].xy + vec2(1.0f, 1.0f)) * uResolution * 0.5f;
        float dist2 = dot(distVec, distVec);
        minDist = min(minDist, dist2);
    }

    vec3 bg = texture(uTexture, gl_FragCoord.xy / uResolution).rgb;

    if(minDist > 5.0f * 5.0f || uHiddenMasses == 1) {
        // Slightly transparent black
        fragColor = vec4(floor(255.0f * bg * uOpacity) / 255.0f, uOpacity);
    } else {
        // Red color for mass positions
        fragColor = vec4(1.0f, 0.0f, 0.0f, 1.0f);
    }
}
