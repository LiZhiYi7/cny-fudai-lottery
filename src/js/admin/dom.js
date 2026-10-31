// 后台面板的 DOM / 数据小工具，不依赖任何第三方库。

/** 深拷贝纯数据（配置、对局对象里没有函数）。 */
export function clone(value) {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      /* 回退到 JSON 拷贝 */
    }
  }
  return JSON.parse(JSON.stringify(value));
}

/** 纯数据是否完全一致（用于脏检查）。 */
export function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** 格式化归档文件大小；浏览器模式拿不到大小时返回 —。 */
export function formatSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}

/** 把错误对象转成可展示的短文本。 */
export function errText(err) {
  if (!err) return '未知错误';
  if (typeof err === 'string') return err;
  if (err.message) return String(err.message);
  return String(err);
}

/** 清理字段红字：把同一个 .adm-field 内的错误行清空。 */
export function clearFieldErrorText(node) {
  const field = node && node.closest ? node.closest('.adm-field') : null;
  const err = field ? field.querySelector('.adm-error') : null;
  if (err) err.textContent = '';
}

export function statusLabel(status) {
  if (status === 'playing') return '进行中';
  if (status === 'finished') return '已结束';
  if (status === 'abandoned') return '已中止';
  return '未知状态';
}
