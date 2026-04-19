import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { ask } from '@tauri-apps/plugin-dialog'

export async function checkForUpdates(silent = false) {
  try {
    const update = await check()

    if (!update?.available) {
      if (!silent) console.log('App is up to date')
      return
    }

    const yes = await ask(
      `Version ${update.version} is available.\n\n${update.body ?? ''}\n\nInstall now?`,
      { title: 'Update available', kind: 'info' }
    )

    if (yes) {
      await update.downloadAndInstall()
      await relaunch()
    }
  } catch (err) {
    console.error('Update check failed:', err)
  }
}
