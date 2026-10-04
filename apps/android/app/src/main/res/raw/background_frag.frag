#ifdef GL_OES_standard_derivatives
#extension GL_OES_standard_derivatives : enable
#endif
precision highp float;
uniform sampler2D u_backgroundTexture;
varying vec2 v_texCoord;

// LeanOn's two Prismal surfaces are capsules. Mask the raw backdrop pass too:
// the upstream renderer otherwise paints a rectangle outside the glass shader.
void main() {
    vec4 color = texture2D(u_backgroundTexture, v_texCoord);
#ifdef GL_OES_standard_derivatives
    vec2 pixel = vec2(abs(dFdx(v_texCoord.x)), abs(dFdy(v_texCoord.y)));
    float aspect = pixel.y / max(pixel.x, 0.000001);
    vec2 halfSize = vec2(aspect, 1.0) * 0.5;
    float radius = min(halfSize.x, halfSize.y);
    vec2 q = abs((v_texCoord - 0.5) * vec2(aspect, 1.0)) - halfSize + radius;
    float distance = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
    float coverage = 1.0 - smoothstep(-pixel.y, pixel.y, distance);
    color.a *= coverage;
#endif
    // Retain upstream behavior on older ES 2 drivers without derivatives.
    gl_FragColor = color;
}
