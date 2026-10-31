// 文件导出：Electron 走保存对话框，浏览器走下载。统一 toast 反馈。

import { storage } from '../core/storage.js';
import { toast } from '../game/ui.js';
import { errText } from './dom.js';

/**
 * 保存文本文件，返回是否成功（取消不算失败）。
 * @returns {Promise<boolean>}
 */
export async function saveTextFile({ defaultName, content, filters }) {
  try {
    const res = await storage.saveTextFile({ defaultName, content, filters });
    if (res && res.ok) {
      toast('已导出：' + (res.path || defaultName));
      return true;
    }
    if (res && res.canceled) {
      toast('已取消导出');
      return false;
    }
    toast('导出失败', 'error');
    return false;
  } catch (err) {
    toast('导出失败：' + errText(err), 'error');
    return false;
  }
}

export const JSON_FILTERS = [{ name: 'JSON 文件', extensions: ['json'] }];
export const CSV_FILTERS = [{ name: 'CSV 表格', extensions: ['csv'] }];
