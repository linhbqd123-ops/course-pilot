import { Page } from 'playwright';
import {
  DetectVideoToolInput,
  VideoInfo,
  ControlVideoToolInput,
  ToolOutput,
} from './types.js';

export async function detectVideo(
  page: Page,
  input: DetectVideoToolInput
): Promise<ToolOutput<VideoInfo>> {
  const startTime = Date.now();

  try {
    const videoInfo = await page.evaluate(() => {
      // Check for HTML5 video element
      const videoElements = document.querySelectorAll('video');
      if (videoElements.length > 0) {
        const video = videoElements[0] as HTMLVideoElement;
        return {
          detected: true,
          type: 'html5',
          selector: 'video',
          duration: video.duration,
          currentTime: video.currentTime,
          paused: video.paused,
          playbackRate: video.playbackRate,
        };
      }

      // Check for YouTube iframe
      const youtubeIframes = document.querySelectorAll(
        'iframe[src*="youtube.com"], iframe[src*="youtu.be"]'
      );
      if (youtubeIframes.length > 0) {
        return {
          detected: true,
          type: 'youtube',
          selector: 'iframe[src*="youtube.com"]',
        };
      }

      // Check for Vimeo iframe
      const vimeoIframes = document.querySelectorAll('iframe[src*="vimeo.com"]');
      if (vimeoIframes.length > 0) {
        return {
          detected: true,
          type: 'vimeo',
          selector: 'iframe[src*="vimeo.com"]',
        };
      }

      // Check for common video player selectors
      const playerSelectors = [
        '.video-player',
        '.player',
        '[class*="video"]',
        '[id*="player"]',
        '.jwplayer',
      ];

      for (const sel of playerSelectors) {
        if (document.querySelector(sel)) {
          return {
            detected: true,
            type: 'custom',
            selector: sel,
          };
        }
      }

      return {
        detected: false,
      };
    });

    return {
      success: true,
      data: videoInfo,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Video detection failed',
      duration: Date.now() - startTime,
      data: { detected: false },
    };
  }
}

export async function controlVideo(
  page: Page,
  input: ControlVideoToolInput
): Promise<ToolOutput<any>> {
  const startTime = Date.now();

  try {
    const { action, rate, time, pollInterval = 1000, waitForFinish = false } = input;

    if (action === 'play') {
      await page.evaluate(() => {
        const video = document.querySelector('video') as HTMLVideoElement;
        if (video) {
          video.play().catch(() => {});
        }
      });

      if (waitForFinish) {
        // Wait for video to finish
        await page.evaluate(
          (pollMs) => {
            return new Promise((resolve) => {
              const video = document.querySelector('video') as HTMLVideoElement;
              if (!video) {
                resolve(false);
                return;
              }

              const checkInterval = setInterval(() => {
                if (video.ended || !video.duration || video.currentTime >= video.duration * 0.95) {
                  clearInterval(checkInterval);
                  resolve(true);
                }
              }, pollMs);

              // Safety exit after 15 minutes if still playing
              setTimeout(() => {
                clearInterval(checkInterval);
                resolve(false);
              }, 15 * 60 * 1000);
            });
          },
          pollInterval
        );
      }

      return {
        success: true,
        data: { action: 'play', result: 'started' },
        duration: Date.now() - startTime,
      };
    } else if (action === 'pause') {
      await page.evaluate(() => {
        const video = document.querySelector('video') as HTMLVideoElement;
        if (video) {
          video.pause();
        }
      });

      return {
        success: true,
        data: { action: 'pause', result: 'paused' },
        duration: Date.now() - startTime,
      };
    } else if (action === 'setRate') {
      const result = await page.evaluate((newRate) => {
        const video = document.querySelector('video') as HTMLVideoElement;
        if (video) {
          video.playbackRate = newRate;
          return { success: true, rate: video.playbackRate };
        }
        return { success: false };
      }, rate || 1.5);

      return {
        success: result.success,
        data: result,
        duration: Date.now() - startTime,
      };
    } else if (action === 'seek') {
      await page.evaluate((seekTime) => {
        const video = document.querySelector('video') as HTMLVideoElement;
        if (video) {
          video.currentTime = Math.min(seekTime, video.duration);
        }
      }, time || 0);

      return {
        success: true,
        data: { action: 'seek', time },
        duration: Date.now() - startTime,
      };
    } else if (action === 'getState') {
      const state = await page.evaluate(() => {
        const video = document.querySelector('video') as HTMLVideoElement;
        if (video) {
          return {
            duration: video.duration,
            currentTime: video.currentTime,
            paused: video.paused,
            ended: video.ended,
            playbackRate: video.playbackRate,
            percentComplete: (video.currentTime / video.duration) * 100,
          };
        }
        return null;
      });

      return {
        success: !!state,
        data: state || { error: 'No video element found' },
        duration: Date.now() - startTime,
      };
    }

    return {
      success: false,
      error: `Unknown action: ${action}`,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Video control failed',
      duration: Date.now() - startTime,
    };
  }
}

export async function waitForVideoEnd(
  page: Page,
  maxWaitTime: number = 600000 // 10 minutes
): Promise<ToolOutput<{ completed: boolean; duration: number }>> {
  const startTime = Date.now();

  try {
    const result = await page.evaluate(
      (maxWait) => {
        return new Promise((resolve) => {
          const video = document.querySelector('video') as HTMLVideoElement;
          if (!video) {
            resolve({ completed: false, error: 'No video found' });
            return;
          }

          const startTime = Date.now();

          const checkInterval = setInterval(() => {
            if (video.ended) {
              clearInterval(checkInterval);
              resolve({
                completed: true,
                duration: video.duration,
                watched: video.duration,
              });
            }

            if (Date.now() - startTime > maxWait) {
              clearInterval(checkInterval);
              resolve({
                completed: false,
                duration: video.duration,
                watched: video.currentTime,
              });
            }
          }, 500);
        });
      },
      maxWaitTime
    );

    return {
      success: true,
      data: result,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Wait for video end failed',
      duration: Date.now() - startTime,
    };
  }
}
