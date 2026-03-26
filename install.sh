#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Cusi - Claude Code Hook Installer
# Usage:
#   Install (user-level):    curl -fsSL .../install.sh | bash -s -- --user
#   Install (project-level): curl -fsSL .../install.sh | bash -s -- --project
#   Uninstall (user-level):  curl -fsSL .../install.sh | bash -s -- uninstall --user
#   Uninstall (project-level): curl -fsSL .../install.sh | bash -s -- uninstall --project
# ==============================================================================

REPO="wangbooth/cu-si"
BRANCH="main"
RAW_BASE="https://raw.githubusercontent.com/${REPO}/${BRANCH}"

# ---------------- Parse arguments ----------------
COMMAND="${1:-}"
SCOPE="${2:-}"

if [[ "$COMMAND" == "uninstall" ]]; then
  ACTION="uninstall"
  SCOPE_ARG="$SCOPE"
elif [[ "$COMMAND" == "--user" || "$COMMAND" == "--project" ]]; then
  ACTION="install"
  SCOPE_ARG="$COMMAND"
else
  echo "❌ 用法错误"
  echo ""
  echo "安装（用户级，所有项目生效）:"
  echo "  curl -fsSL https://raw.githubusercontent.com/${REPO}/${BRANCH}/install.sh | bash -s -- --user"
  echo ""
  echo "安装（项目级，当前项目生效，在项目根目录运行）:"
  echo "  curl -fsSL https://raw.githubusercontent.com/${REPO}/${BRANCH}/install.sh | bash -s -- --project"
  echo ""
  echo "卸载:"
  echo "  curl -fsSL https://raw.githubusercontent.com/${REPO}/${BRANCH}/install.sh | bash -s -- uninstall --user"
  echo "  curl -fsSL https://raw.githubusercontent.com/${REPO}/${BRANCH}/install.sh | bash -s -- uninstall --project"
  exit 1
fi

# ---------------- Resolve paths based on scope ----------------
if [[ "$SCOPE_ARG" == "--user" ]]; then
  INSTALL_DIR="${HOME}/.cusi/hook"
  SETTINGS_FILE="${HOME}/.claude/settings.json"
  SETTINGS_DIR="${HOME}/.claude"
elif [[ "$SCOPE_ARG" == "--project" ]]; then
  INSTALL_DIR="$(pwd)/.cusi/hook"
  SETTINGS_FILE="$(pwd)/.claude/settings.json"
  SETTINGS_DIR="$(pwd)/.claude"
else
  echo "❌ 请指定安装范围: --user 或 --project"
  exit 1
fi

EVENTS_FILE="${HOME}/.cusi/events.json"
HOOK_SCRIPT="${INSTALL_DIR}/src/hook.js"

# ---------------- Dependency check ----------------
check_deps() {
  local missing=()
  if ! command -v node &>/dev/null; then
    missing+=("node")
  fi
  if ! command -v npm &>/dev/null; then
    missing+=("npm")
  fi
  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "❌ 缺少依赖: ${missing[*]}"
    echo "请先安装 Node.js: https://nodejs.org"
    exit 1
  fi
  echo "✓ node $(node --version), npm $(npm --version)"
}

# ---------------- Download files ----------------
download_files() {
  echo "📥 正在下载文件到 ${INSTALL_DIR} ..."
  mkdir -p "${INSTALL_DIR}/src"

  curl -fsSL "${RAW_BASE}/claude-code-hook/src/hook.js"    -o "${INSTALL_DIR}/src/hook.js"
  curl -fsSL "${RAW_BASE}/claude-code-hook/src/cli.js"     -o "${INSTALL_DIR}/src/cli.js"
  curl -fsSL "${RAW_BASE}/claude-code-hook/src/install.js" -o "${INSTALL_DIR}/src/install.js"
  curl -fsSL "${RAW_BASE}/claude-code-hook/package.json"   -o "${INSTALL_DIR}/package.json"
  chmod +x "${INSTALL_DIR}/src/hook.js"

  # Download events data to ~/.cusi/events.json (shared, skip if exists)
  if [[ ! -f "${EVENTS_FILE}" ]]; then
    mkdir -p "${HOME}/.cusi"
    curl -fsSL "${RAW_BASE}/data/events.json" -o "${EVENTS_FILE}"
    echo "✓ 事件数据已下载"
  else
    echo "✓ 事件数据已存在，跳过下载"
  fi

  echo "✓ 文件下载完成"
}

# ---------------- npm install ----------------
run_npm_install() {
  echo "📦 正在安装依赖..."
  (cd "${INSTALL_DIR}" && npm install --silent)
  echo "✓ 依赖安装完成"
}

# ---------------- Install ----------------
do_install() {
  echo "🔧 正在安装 Cusi Claude Code Hook (${SCOPE_ARG#--}级)..."
  echo ""

  # Check for existing install
  if [[ -f "${HOOK_SCRIPT}" ]]; then
    echo "⚠️  检测到已安装的版本，将覆盖更新"
  fi

  check_deps
  download_files
  run_npm_install

  # Register hook via install.js
  mkdir -p "${SETTINGS_DIR}"
  node "${INSTALL_DIR}/src/install.js" \
    "--settings-file=${SETTINGS_FILE}" \
    "--hook-path=${HOOK_SCRIPT}"

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "✅ 安装完成！"
  echo ""
  echo "Hook 文件:    ${HOOK_SCRIPT}"
  echo "配置文件:     ${SETTINGS_FILE}"
  echo ""
  echo "快速上手:"
  echo "  node ${INSTALL_DIR}/src/cli.js status     # 查看状态"
  echo "  node ${INSTALL_DIR}/src/cli.js pause 2    # 暂停 2 小时"
  echo "  node ${INSTALL_DIR}/src/cli.js test       # 测试提醒"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# ---------------- Uninstall ----------------
do_uninstall() {
  echo "🔧 正在卸载 Cusi Claude Code Hook (${SCOPE_ARG#--}级)..."
  echo ""

  # Remove hook from settings.json via install.js
  if [[ -f "${HOOK_SCRIPT}" ]]; then
    node "${INSTALL_DIR}/src/install.js" \
      "--settings-file=${SETTINGS_FILE}" \
      --uninstall
  else
    echo "⚠️  未找到 hook 文件，尝试仅清理配置..."
    # Inline node script to remove hook entry without the install.js file
    node - <<EOF
const fs = require('fs');
const path = '${SETTINGS_FILE}';
if (!fs.existsSync(path)) { console.log('配置文件不存在，无需清理'); process.exit(0); }
const s = JSON.parse(fs.readFileSync(path, 'utf8'));
if (s.hooks && s.hooks.stop) {
  s.hooks.stop = s.hooks.stop.filter(h => !(h.command && h.command.includes('cusi')));
  fs.writeFileSync(path, JSON.stringify(s, null, 2));
  console.log('✓ Hook 已从配置中移除');
}
EOF
  fi

  # Remove hook directory
  if [[ -d "${INSTALL_DIR}" ]]; then
    rm -rf "${INSTALL_DIR}"
    echo "✓ Hook 文件已删除: ${INSTALL_DIR}"
  fi

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "✅ 卸载完成"
  echo ""
  echo "注意：${HOME}/.cusi/ 中的配置和事件数据已保留"
  echo "如需完全清除: rm -rf ${HOME}/.cusi"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# ---------------- Main ----------------
if [[ "$ACTION" == "install" ]]; then
  do_install
else
  do_uninstall
fi
