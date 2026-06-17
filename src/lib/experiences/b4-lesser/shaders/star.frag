varying vec3 vC;
varying float vTw;
varying float vGlitch;

void main() {
    vec2 pt = gl_PointCoord - 0.5;
    float r = length(pt);

    // 1. Dynamic Shape: 4-pointed star burst
    float angle = atan(pt.y, pt.x);
    float burst = abs(cos(angle * 2.0)); 
    // Shape multiplier stretches the radius on the diagonals to carve out the points
    float shapeMultiplier = 1.0 + (1.0 - burst) * 6.0;

    // 2. Local Chromatic Aberration
    // Shift the sample coordinates horizontally. Shift widens dramatically during a glitch.
    float caOffset = 0.02 + (vGlitch * 0.15);
    vec2 rPt = pt + vec2(caOffset, 0.0);
    vec2 bPt = pt - vec2(caOffset, 0.0);
    
    // Calculate core intensity per channel applying the burst shape
    float rCore = exp(-length(rPt) * shapeMultiplier * 45.0);
    float gCore = exp(-r * shapeMultiplier * 45.0);
    float bCore = exp(-length(bPt) * shapeMultiplier * 45.0);

    vec3 col = vC;
    
    // Glitch color shift: Invert colors randomly
    if (vGlitch > 0.0) {
        col.gb = col.bg; 
    }

    // Combine CA channels
    vec3 caColor = vec3(rCore, gCore, bCore) * col;

    // 3. Extreme Anamorphic Flare (Speed Lines)
    // Add vertical distortion to the flare when glitching
    float streak = exp(-abs(pt.y + vGlitch * 0.1) * 150.0 - abs(pt.x) * 4.0) * 2.0;

    // 4. Volumetric Optical Glow
    float halo = exp(-r * 15.0) * 0.4;

    float alpha = (rCore + gCore + bCore + streak + halo) * vTw;
    if (alpha < 0.01) discard;

    vec3 finalColor = caColor + (vec3(streak) + vec3(halo)) * col;

    // Over-saturate the center to pure white
    finalColor = mix(finalColor, vec3(1.0, 1.0, 1.0), min(gCore * 2.5, 1.0));

    // Overdrive brightness multiplier for WebGPU Bloom
    gl_FragColor = vec4(finalColor * alpha * 4.0, alpha);
}