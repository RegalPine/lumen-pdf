interface AnimationFrames {
  request: (callback: FrameRequestCallback) => number;
  cancel: (id: number) => void;
}

// 两次动画帧之间让浏览器获得一次绘制机会；后台任务不能在画布完成的同一微任务内抢占首屏。
export function afterNextPaint(
  callback: () => void,
  frames: AnimationFrames = {
    request: callback => window.requestAnimationFrame(callback),
    cancel: id => window.cancelAnimationFrame(id),
  },
): () => void {
  let cancelled = false;
  let frame = frames.request(() => {
    if (cancelled) return;
    frame = frames.request(() => {
      if (!cancelled) callback();
    });
  });
  return () => {
    cancelled = true;
    frames.cancel(frame);
  };
}
