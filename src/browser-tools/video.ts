import { Page } from 'playwright';
import {
  DetectVideoToolInput,
  VideoInfo,
  ControlVideoToolInput,
  ToolOutput,
} from './types.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger();

export async function detectVideo(
  page: Page,
  input: DetectVideoToolInput
): Promise<ToolOutput<VideoInfo>> {
  const startTime = Date.now();
  logger.info(`[VIDEO] Detecting video on page...`);

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

    if (videoInfo.detected) {
      const duration = videoInfo.duration ? `${Math.round(videoInfo.duration)}s` : 'unknown';
      logger.info(`[VIDEO] Video detected! Type: ${videoInfo.type}, Duration: ${duration}`);
    } else {
      logger.info(`[VIDEO] No video detected on page`);
    }

    return {
      success: true,
      data: videoInfo as any,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Video detection failed';
    logger.error(`[VIDEO] Video detection failed: ${errorMsg}`);
    return {
      success: false,
      error: errorMsg,
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
  logger.info(`[VIDEO] Video control: ${input.action}${input.rate ? ` (rate: ${input.rate}x)` : ''}${input.time ? ` (seek to: ${input.time}s)` : ''}`);

  try {
    const { action, rate, time, pollInterval = 1000, waitForFinish = false } = input;

    if (action === 'play') {
      logger.info(`[VIDEO] Starting video playback...`);
      await page.evaluate(() => {
        const video = document.querySelector('video') as HTMLVideoElement;
        if (video) {
          video.play().catch(() => { });
        }
      });

      if (waitForFinish) {
        logger.info(`[VIDEO] Waiting for video to finish (max 15 minutes)...`);
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
        logger.info(`[VIDEO] Video playback completed`);
      }

      return {
        success: true,
        data: { action: 'play', result: 'started' },
        duration: Date.now() - startTime,
      };
    } else if (action === 'pause') {
      logger.info(`[VIDEO] Pausing video...`);
      await page.evaluate(() => {
        const video = document.querySelector('video') as HTMLVideoElement;
        if (video) {
          video.pause();
        }
      });
      logger.info(`[VIDEO] Video paused`);

      return {
        success: true,
        data: { action: 'pause', result: 'paused' },
        duration: Date.now() - startTime,
      };
    } else if (action === 'setRate') {
      logger.info(`[VIDEO] Setting playback rate to ${rate}x...`);
      const result = await page.evaluate((newRate) => {
        const video = document.querySelector('video') as HTMLVideoElement;
        if (video) {
          video.playbackRate = newRate;
          return { success: true, rate: video.playbackRate };
        }
        return { success: false };
      }, rate || 1.5);

      if (result.success) {
        logger.info(`[VIDEO] Playback rate set to ${result.rate}x`);
      } else {
        logger.warn(`[VIDEO] Failed to set playback rate`);
      }

      return {
        success: result.success,
        data: result,
        duration: Date.now() - startTime,
      };
    } else if (action === 'seek') {
      logger.info(`[VIDEO] Seeking to ${time}s...`);
      await page.evaluate((seekTime) => {
        const video = document.querySelector('video') as HTMLVideoElement;
        if (video) {
          video.currentTime = Math.min(seekTime, video.duration);
        }
      }, time || 0);
      logger.info(`[VIDEO] Seek completed`);

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

      if (state) {
        logger.info(`[VIDEO] Current state: ${state.percentComplete.toFixed(1)}% complete, Paused: ${state.paused}`);
      } else {
        logger.warn(`[VIDEO] No video element found`);
      }

      return {
        success: !!state,
        data: state || { error: 'No video element found' },
        duration: Date.now() - startTime,
      };
    }

    logger.error(`[VIDEO] Unknown action: ${action}`);
    return {
      success: false,
      error: `Unknown action: ${action}`,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Video control failed';
    logger.error(`[VIDEO] Video control failed: ${errorMsg}`);
    return {
      success: false,
      error: errorMsg,
      duration: Date.now() - startTime,
    };
  }
}

export async function waitForVideoEnd(
  page: Page,
  maxWaitTime: number = 600000 // 10 minutes
): Promise<ToolOutput<{ completed: boolean; duration: number }>> {
  const startTime = Date.now();
  const maxWaitMins = Math.round(maxWaitTime / 60000);
  logger.info(`[VIDEO] Waiting for video to finish (max ${maxWaitMins} minutes)...`);

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

    if ((result as any).completed) {
      logger.info(`[VIDEO] Video finished successfully (${Math.round((result as any).duration)}s)`);
    } else {
      const watchedMins = Math.round(((result as any).watched || 0) / 60);
      logger.warn(`[VIDEO] Video wait timeout. Watched: ${watchedMins}m / ${Math.round(((result as any).duration || 0) / 60)}m`);
    }

    return {
      success: true,
      data: result as any,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Wait for video end failed';
    logger.error(`[VIDEO] Wait for video end failed: ${errorMsg}`);
    return {
      success: false,
      error: errorMsg,
      duration: Date.now() - startTime,
    };
  }
}
