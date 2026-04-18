import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

export interface RoundedCornersConfig {
  /**
   * Corner radius in pixels (default: 12.0)
   */
  cornerRadius?: number;
  /**
   * Horizontal offset for Traffic Lights in pixels
   * Positive = right, Negative = left (default: 0.0)
   */
  offsetX?: number;
  /**
   * Vertical offset for Traffic Lights in pixels
   * Positive = down, Negative = up (default: 0.0)
   */
  offsetY?: number;
}

let currentConfig: RoundedCornersConfig | null = null;

/**
 * Reposition Traffic Lights only (after fullscreen toggle, etc.)
 */
export async function repositionTrafficLights(): Promise<void> {
  if (!currentConfig) return;
  
  try {
    const window = getCurrentWebviewWindow();
    await invoke('reposition_traffic_lights', {
      window,
      offsetX: currentConfig.offsetX ?? 0.0,
      offsetY: currentConfig.offsetY ?? 0.0,
    });
  } catch (error) {
    console.error('Failed to reposition traffic lights:', error);
  }
}

/**
 * Enables rounded corners for the current window (macOS only)
 * Uses only public APIs - App Store compatible
 * Automatically repositions Traffic Lights after fullscreen toggle
 */
export async function enableRoundedCorners(config?: RoundedCornersConfig): Promise<void> {
  try {
    currentConfig = config || {};
    const window = getCurrentWebviewWindow();
    
    await invoke('enable_rounded_corners', {
      window,
      offsetX: config?.offsetX ?? 0.0,
      offsetY: config?.offsetY ?? 0.0,
    });

    // Setup event-based monitoring
    setupResizeListener();
  } catch (error) {
    console.error('Failed to enable rounded corners:', error);
    throw error;
  }
}

/**
 * Enables modern window style with rounded corners and shadow (macOS only)
 * Recommended method for best visual appearance
 * Automatically repositions Traffic Lights after fullscreen toggle
 */
export async function enableModernWindowStyle(config?: RoundedCornersConfig): Promise<void> {
  try {
    currentConfig = config || {};
    const window = getCurrentWebviewWindow();
    
    await invoke('enable_modern_window_style', {
      window,
      cornerRadius: config?.cornerRadius ?? 20.0,
      offsetX: config?.offsetX ?? 0.0,
      offsetY: config?.offsetY ?? 0.0,
    });

    // Setup event-based monitoring
    setupResizeListener();
  } catch (error) {
    console.error('Failed to enable modern window style:', error);
    throw error;
  }
}

let unlistenResize: (() => void) | null = null;

async function setupResizeListener() {
  // Clear existing listener
  if (unlistenResize) {
    unlistenResize();
  }

  const window = getCurrentWebviewWindow();
  
  try {
    // Listen to resize events (fires on fullscreen toggle)
    unlistenResize = await window.onResized(() => {
      // Reposition immediately - macOS should have the buttons ready
      repositionTrafficLights();
    });
  } catch (error) {
    console.error('Failed to setup resize listener:', error);
  }
}

/**
 * Cleanup function - call when component unmounts
 */
export function cleanupRoundedCorners(): void {
  if (unlistenResize) {
    unlistenResize();
    unlistenResize = null;
  }
  currentConfig = null;
}
