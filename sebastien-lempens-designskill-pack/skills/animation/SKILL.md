---
name: sebastien-lempens-animation
description: >
  Animation patterns, transitions, and keyframe motions.
---

# Animation & Easing System — sebastien-lempens

This skill provides keyframes, timings, and easing curves to reproduce the interactive micro-animations of sebastien-lempens.

## Captured Timings & Easing Functions
- `right 1.2s ease 1s`
- `opacity .8s ease`
- `background-color .3s ease`
- `opacity .3s ease,transform .3s ease`
- `.1s,.1s`
- `.2s,.2s`
- `calc(.1s*3),calc(.1s*3)`
- `.4s,.4s`
- `transform .3s ease-in-out`
- `linear`
- `.15s`
- `opacity,filter`
- `opacity .4s ease`
- `transform .3s ease`
- `ease`
- `transform`
- `ease ease ease`
- `0ms`
- `.15s,.15s,.15s`
- `top,bottom,transform`
- `cubic-bezier(.18,.89,.32,1.28)`
- `transform .3s ease-in-out .25s,opacity .3s ease-in-out`
- `transform .3s ease-in-out,opacity .3s ease-in-out`
- `volumeAnimation 1.3s ease infinite alternate`
- `-2.2s`
- `-3.7s`
- `opacity .3s cubic-bezier(.18,.89,.32,1.28),transform .3s cubic-bezier(.18,.89,.32,1.28)`
- `50ms,50ms`
- `100ms,100ms`
- `150ms,150ms`
- `200ms,200ms`
- `2s`
- `all 1s cubic-bezier(.25,.46,.45,.94) .25s`
- `transform .3s cubic-bezier(.25,.46,.45,.94),clip-path .3s cubic-bezier(.25,.46,.45,.94),opacity .8s ease,color .8s ease`
- `opacity .8s ease-out`
- `transform .6s ease,opacity .6s ease`
- `background-color 1s ease 2s`
- `all 1s cubic-bezier(.22,.61,.36,1) 2s`
- `all 1s cubic-bezier(.25,.46,.45,.94) 1.2s`
- `all 2s cubic-bezier(.4,0,1,1)`
- `transform .3s ease .18s,opacity .3s ease .18s,background-color .3s ease`
- `clip-path .4s ease .15s`
- `transform .4s ease .25s,opacity .4s ease .25s`
- `opacity .6s ease,border-color .3s ease`
- `buttonBackgroundAnimation 1.5s ease-in-out infinite`
- `opacity .6s ease 50ms`
- `transform .3s cubic-bezier(.42,0,.56,1.45)`
- `rocketAnimation 80ms ease-in-out infinite alternate`
- `opacity .6s ease .3s`
- `clip-path .6s cubic-bezier(.55,.06,.68,.19)`
- `transform .15s cubic-bezier(.55,.06,.68,.19) 50ms,opacity .15s cubic-bezier(.55,.06,.68,.19) 50ms`
- `clip-path .6s ease .45s`
- `transform 2.2s ease 80ms`
- `cubic-bezier(.22,.61,.36,1)`
- `.6s,1.2s`
- `.2s`
- `.3s`
- `joystickArrowNotification .8s ease-in-out infinite alternate-reverse`
- `joystickNotification 1.6s ease infinite`
- `opacity .6s ease`
- `1s`
- `background-color 1s ease`
- `transform 1s ease`
- `color .3s ease`
- `opacity .3s ease,transform .8s ease`
- `clip-path .6s ease,transform .4s ease`
- `animationCursorScroll 1s ease-in-out infinite`
- `opacity 1200ms ease`
- `opacity 600ms cubic-bezier(0.22,0.61,0.36,1),left 600ms cubic-bezier(0.22,0.61,0.36,1)`
- `wheelAnimation 220ms linear infinite`
- `motocycleAnimation 15ms infinite linear`
- `cityAnimation 5s linear infinite`
- `opacity 1200ms cubic-bezier(0.22,0.61,0.36,1) 450ms`
- `clip-path 500ms ease 50ms`
- `monumentsAnimation 8s linear infinite`
- `background-color 300ms ease`
- `clip-path 500ms ease-out 50ms,background-color 300ms ease`
- `clip-path 500ms ease-out 50ms`
- `1200ms`
- `transform 1200ms ease`
- `transform 800ms ease`

## Keyframes & Custom Animations
### Animation: animationCursorScroll
```css
@keyframes animationCursorScroll {
  to {
    clip-path: inset(8px 0 1px 0);
  }
}
```

### Animation: joystickNotification
```css
@keyframes joystickNotification {
  to {
    transform: translate(-50%,-150%) scale(1);
    opacity: 0;
  }
}
```

### Animation: joystickArrowNotification
```css
@keyframes joystickArrowNotification {
  to {
    transform: rotate(25deg) translate(-50%) translateY(-0px) scale(.5);
  }
}
```

### Animation: buttonBackgroundAnimation
```css
@keyframes buttonBackgroundAnimation {
  to {
    background-position-x: 250px;
  }
}
```

### Animation: backgroundColorAnimation
```css
@keyframes backgroundColorAnimation {
  to {
    background-color: #7b5b6980;
  }
}
```

### Animation: rocketAnimation
```css
@keyframes rocketAnimation {
  to {
    transform: translateY(2px) translate(-2px);
    opacity: .25;
  }
}
```

### Animation: volumeAnimation
```css
@keyframes volumeAnimation {
  10% {
    height: 30%;
  }
  30% {
    height: 100%;
  }
  60% {
    height: 50%;
  }
  80% {
    height: 75%;
  }
  to {
    height: 60%;
  }
}
```

### Animation: motocycleAnimation
```css
@keyframes motocycleAnimation {
  from {
    transform: scaleY(0.98);
  }
  to {
    transform: scaleY(1);
  }
}
```

### Animation: cityAnimation
```css
@keyframes cityAnimation {
  to {
    background-position-x: -2000px;
  }
}
```

### Animation: wheelAnimation
```css
@keyframes wheelAnimation {
  to {
    transform: rotate(360deg);
  }
}
```

### Animation: monumentsAnimation
```css
@keyframes monumentsAnimation {
  to {
    background-position-x: calc((80px*3)*-1);
  }
}
```

## UI Animation Guidelines
- Use smooth, cubic-bezier transitions for transforms, background-color, and opacity.
- Avoid linear transitions; use easing like `cubic-bezier(0.4, 0, 0.2, 1)` for UI elements (menus, tabs, drawers).
- For custom counts or fade-in animations, refer to the keyframes above.
