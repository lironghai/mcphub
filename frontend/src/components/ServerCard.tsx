import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Server } from '@/types'
import { ChevronDown, ChevronRight, AlertCircle, Copy, Check, Download, ExternalLink } from 'lucide-react'
import { StatusBadge } from '@/components/ui/Badge'
import ToolCard from '@/components/ui/ToolCard'
import DeleteDialog from '@/components/ui/DeleteDialog'
import { useToast } from '@/contexts/ToastContext'

interface ServerCardProps {
  server: Server
  onRemove: (serverName: string) => void
  onEdit: (server: Server) => void
  onToggle?: (server: Server, enabled: boolean) => Promise<boolean>
  onRefresh?: () => void
}

const ServerCard = ({ server, onRemove, onEdit, onToggle, onRefresh }: ServerCardProps) => {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const [isExpanded, setIsExpanded] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isToggling, setIsToggling] = useState(false)
  const [showErrorPopover, setShowErrorPopover] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showInstallModal, setShowInstallModal] = useState(false)
  const [configCopied, setConfigCopied] = useState(false)
  const [mcpConfig, setMcpConfig] = useState<string>('')
  const [configLoading, setConfigLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'cursor' | 'claudeCode' | 'claudeDesktop'>('cursor')
  const errorPopoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (errorPopoverRef.current && !errorPopoverRef.current.contains(event.target as Node)) {
        setShowErrorPopover(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowDeleteDialog(true)
  }

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
    onEdit(server)
  }

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isToggling || !onToggle) return

    setIsToggling(true)
    try {
      await onToggle(server, !(server.enabled !== false))
    } finally {
      setIsToggling(false)
    }
  }

  const handleInstall = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowInstallModal(true)
    // 打开弹窗时立即加载配置
    if (!mcpConfig) {
      await loadMcpConfig()
    }
  }

  const handleErrorIconClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowErrorPopover(!showErrorPopover)
  }

  const copyToClipboard = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!server.error) return

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(server.error).then(() => {
        setCopied(true)
        showToast(t('common.copySuccess') || 'Copied to clipboard', 'success')
        setTimeout(() => setCopied(false), 2000)
      })
    } else {
      // Fallback for HTTP or unsupported clipboard API
      const textArea = document.createElement('textarea')
      textArea.value = server.error
      // Avoid scrolling to bottom
      textArea.style.position = 'fixed'
      textArea.style.left = '-9999px'
      document.body.appendChild(textArea)
      textArea.focus()
      textArea.select()
      try {
        document.execCommand('copy')
        setCopied(true)
        showToast(t('common.copySuccess') || 'Copied to clipboard', 'success')
        setTimeout(() => setCopied(false), 2000)
      } catch (err) {
        showToast(t('common.copyFailed') || 'Copy failed', 'error')
        console.error('Copy to clipboard failed:', err)
      }
      document.body.removeChild(textArea)
    }
  }

  const handleConfirmDelete = () => {
    onRemove(server.name)
    setShowDeleteDialog(false)
  }

  const handleToolToggle = async (toolName: string, enabled: boolean) => {
    try {
      const { toggleTool } = await import('@/services/toolService')
      const result = await toggleTool(server.name, toolName, enabled)

      if (result.success) {
        showToast(
          t(enabled ? 'tool.enableSuccess' : 'tool.disableSuccess', { name: toolName }),
          'success'
        )
        // Trigger refresh to update the tool's state in the UI
        if (onRefresh) {
          onRefresh()
        }
      } else {
        showToast(result.error || t('tool.toggleFailed'), 'error')
      }
    } catch (error) {
      console.error('Error toggling tool:', error)
      showToast(t('tool.toggleFailed'), 'error')
    }
  }

  // 生成单个服务器的MCP配置 - 用于深度链接
  const generateSingleServerConfig = async () => {
    try {
      const { getApiUrl } = await import('@/utils/runtime')
      const token = localStorage.getItem('mcphub_token')
      
      // 获取完整的设置配置
      const response = await fetch(getApiUrl('/settings'), {
        headers: {
          'x-auth-token': token || ''
        }
      })
      
      if (response.ok) {
        const result = await response.json()
        if (result.success && result.data && result.data.mcpServers && result.data.mcpServers[server.name]) {
          const serverSettings = result.data.mcpServers[server.name]
          
          // 确保stdio模式下命令参数完整
          if (serverSettings.command && (!serverSettings.type || serverSettings.type === 'stdio')) {
            const config = {
              command: serverSettings.command,
              args: serverSettings.args || ['-y', server.name],
              ...(serverSettings.env && Object.keys(serverSettings.env).length > 0 && { env: serverSettings.env })
            }
            
            // 确保args参数完整，特别是包名
            if (config.command === 'npx' && config.args.length === 2 && config.args[0] === '-y') {
              if (!config.args[1].startsWith('@') && !config.args[1].includes('/')) {
                // 如果没有包作用域，尝试添加默认的MCP包前缀
                config.args[1] = `@modelcontextprotocol/server-${server.name}`
              }
            }
            
            return config
          }
          
          // 返回单个服务器配置（不包含外层mcpServers对象）
          return serverSettings
        }
      }
    } catch (error) {
      console.error('Error fetching server settings:', error)
    }
    
    // 如果无法获取实际配置，生成默认配置
    if (!server.config) {
      return {
        command: 'npx',
        args: ['-y', `@modelcontextprotocol/server-${server.name}`]
      }
    }
    
    // 根据服务器类型生成相应的配置
    if (server.config.type === 'sse') {
      return {
        url: server.config.url || "",
        type: "sse"
      }
    } else if (server.config.type === 'streamable-http') {
      return {
        url: server.config.url || "",
        type: "streamable-http",
        ...(server.config.headers && Object.keys(server.config.headers).length > 0 && { headers: server.config.headers })
      }
    } else {
      // stdio类型或默认类型
      const config = {
        command: server.config.command || 'npx',
        args: server.config.args || ['-y', server.name],
        ...(server.config.env && Object.keys(server.config.env).length > 0 && { env: server.config.env })
      }
      
      // 确保args参数完整，特别是包名
      if (config.command === 'npx' && config.args.length === 2 && config.args[0] === '-y') {
        if (!config.args[1].startsWith('@') && !config.args[1].includes('/')) {
          // 如果没有包作用域，尝试添加默认的MCP包前缀
          config.args[1] = `@modelcontextprotocol/server-${server.name}`
        }
      }
      
      return config
    }
  }

  // 生成MCP配置JSON - 从mcp_settings.json中读取实际配置 - 用于显示和复制
  const generateMcpConfig = async () => {
    const singleConfig = await generateSingleServerConfig()
    
    // 返回标准的Cursor MCP配置格式（包含mcpServers外层）
    const mcpConfig = {
      mcpServers: {
        [server.name]: singleConfig
      }
    }
    
    return JSON.stringify(mcpConfig, null, 2)
  }

  // 为Cursor深度链接生成配置（特殊格式）
  const generateCursorDeepLinkConfig = async (): Promise<any> => {
    try {
      const { getApiUrl } = await import('@/utils/runtime')
      const token = localStorage.getItem('mcphub_token')
      
      // 获取完整的设置配置
      const response = await fetch(getApiUrl('/settings'), {
        headers: {
          'x-auth-token': token || ''
        }
      })
      
      if (response.ok) {
        const result = await response.json()
        if (result.success && result.data && result.data.mcpServers && result.data.mcpServers[server.name]) {
          const serverSettings = result.data.mcpServers[server.name]
          
          // 对于stdio模式，Cursor深度链接需要单一command字符串格式
          if (serverSettings.command && (!serverSettings.type || serverSettings.type === 'stdio')) {
            // 将command和args合并为单一字符串
            const fullCommand = serverSettings.args && serverSettings.args.length > 0
              ? `${serverSettings.command} ${serverSettings.args.join(' ')}`
              : `${serverSettings.command} -y @modelcontextprotocol/server-${server.name}`
            
            const config: any = {
              command: fullCommand
            }
            
            // 添加环境变量（如果有）
            if (serverSettings.env && Object.keys(serverSettings.env).length > 0) {
              config.env = serverSettings.env
            }
            
            return config
          }
          
          // 对于其他类型（sse, streamable-http），直接返回原配置
          return serverSettings
        }
      }
    } catch (error) {
      console.error('Error fetching server settings:', error)
    }
    
    // 如果无法获取实际配置，生成默认配置
    if (!server.config) {
      return {
        command: `npx -y @modelcontextprotocol/server-${server.name}`
      }
    }
    
    // 根据服务器类型生成相应的配置
    if (server.config.type === 'sse') {
      return {
        url: server.config.url || "",
        type: "sse"
      }
    } else if (server.config.type === 'streamable-http') {
      return {
        url: server.config.url || "",
        type: "streamable-http",
        ...(server.config.headers && Object.keys(server.config.headers).length > 0 && { headers: server.config.headers })
      }
    } else {
      // stdio类型或默认类型，转换为Cursor格式
      const command = server.config.command || 'npx'
      const args = server.config.args || ['-y', `@modelcontextprotocol/server-${server.name}`]
      const fullCommand = `${command} ${args.join(' ')}`
      
      const config: any = { command: fullCommand }
      if (server.config.env && Object.keys(server.config.env).length > 0) {
        config.env = server.config.env
      }
      return config
    }
  }

  // 尝试使用Cursor深度链接安装
  const tryDeepLinkInstall = async () => {
    try {
      const singleConfig = await generateCursorDeepLinkConfig()
      const configJson = JSON.stringify(singleConfig)
      const encodedConfig = btoa(configJson) // Base64编码
      
      // 构建Cursor深度链接
      const deepLink = `cursor://anysphere.cursor-deeplink/mcp/install?name=${encodeURIComponent(server.name)}&config=${encodeURIComponent(encodedConfig)}`
      
      // 尝试打开深度链接
      const a = document.createElement('a')
      a.href = deepLink
      a.click()
      
      // 给用户一些反馈
      showToast(t('cursor.deepLinkOpened'), 'success')
      
      return true
    } catch (error) {
      console.error('Deep link installation failed:', error)
      return false
    }
  }

  // 通用函数：打开Cursor协议链接（已废弃，现在改为显示安装指导）
  const showInstallInstructions = () => {
    showToast(t('cursor.configurationCopied'), 'success')
    // 这里不再使用深度链接，而是显示配置已复制的提示
  }

  // 加载MCP配置
  const loadMcpConfig = async () => {
    setConfigLoading(true)
    try {
      const config = await generateMcpConfig()
      setMcpConfig(config)
    } catch (error) {
      console.error('Error loading MCP config:', error)
      setMcpConfig('{}')
    } finally {
      setConfigLoading(false)
    }
  }

  // 复制配置到剪贴板
  const copyConfigToClipboard = async () => {
    if (!mcpConfig && !configLoading) {
      await loadMcpConfig()
    }
    
    const config = mcpConfig || '{}'
    
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(config)
        setConfigCopied(true)
        showToast(t('common.copySuccess'), 'success')
        setTimeout(() => setConfigCopied(false), 2000)
      } catch (err) {
        showToast(t('common.copyFailed'), 'error')
      }
    } else {
      // Fallback for HTTP or unsupported clipboard API
      const textArea = document.createElement('textarea')
      textArea.value = config
      textArea.style.position = 'fixed'
      textArea.style.left = '-9999px'
      document.body.appendChild(textArea)
      textArea.focus()
      textArea.select()
      try {
        document.execCommand('copy')
        setConfigCopied(true)
        showToast(t('common.copySuccess'), 'success')
        setTimeout(() => setConfigCopied(false), 2000)
      } catch (err) {
        showToast(t('common.copyFailed'), 'error')
      }
      document.body.removeChild(textArea)
    }
  }

  // 复制Claude Code命令
  const copyClaudeCodeCommand = async () => {
    const singleConfig = await generateSingleServerConfig()
    const configJson = JSON.stringify(singleConfig, null, 2)
    
    const command = `claude mcp add-json "${server.name}" '${configJson.replace(/'/g, "\\'")}'`
    
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(command)
        showToast(t('common.copySuccess'), 'success')
      } catch (err) {
        showToast(t('common.copyFailed'), 'error')
      }
    } else {
      // Fallback
      const textArea = document.createElement('textarea')
      textArea.value = command
      textArea.style.position = 'fixed'
      textArea.style.left = '-9999px'
      document.body.appendChild(textArea)
      textArea.focus()
      textArea.select()
      try {
        document.execCommand('copy')
        showToast(t('common.copySuccess'), 'success')
      } catch (err) {
        showToast(t('common.copyFailed'), 'error')
      }
      document.body.removeChild(textArea)
    }
  }

  // 安装到Cursor - 专门负责深度链接安装
  const installToCursor = async () => {
    try {
      const deepLinkSuccess = await tryDeepLinkInstall()
      
      if (!deepLinkSuccess) {
        // 如果深度链接失败，显示错误提示并建议使用复制配置方式
        showToast(t('cursor.deepLinkFailed'), 'error')
      }
    } catch (error) {
      console.error('Error installing to Cursor:', error)
      showToast(t('cursor.installFailed'), 'error')
    }
  }

  return (
    <>
      <div className={`bg-white shadow rounded-lg p-6 mb-6 page-card transition-all duration-200 ${server.enabled === false ? 'opacity-60' : ''}`}>
        <div
          className="flex justify-between items-center cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center space-x-3">
            <h2 className={`text-xl font-semibold ${server.enabled === false ? 'text-gray-600' : 'text-gray-900'}`}>{server.name}</h2>
            <StatusBadge status={server.status} />

            {/* Tool count display */}
            <div className="flex items-center px-2 py-1 bg-blue-50 text-blue-700 rounded-full text-sm btn-primary">
              <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
              </svg>
              <span>{server.tools?.length || 0} {t('server.tools')}</span>
            </div>

            {server.error && (
              <div className="relative">
                <div
                  className="cursor-pointer"
                  onClick={handleErrorIconClick}
                  aria-label={t('server.viewErrorDetails')}
                >
                  <AlertCircle className="text-red-500 hover:text-red-600" size={18} />
                </div>

                {showErrorPopover && (
                  <div
                    ref={errorPopoverRef}
                    className="absolute z-10 mt-2 bg-white border border-gray-200 rounded-md shadow-lg p-0 w-120"
                    style={{
                      left: '-231px',
                      top: '24px',
                      maxHeight: '300px',
                      overflowY: 'auto',
                      width: '480px',
                      transform: 'translateX(50%)'
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex justify-between items-center sticky top-0 bg-white py-2 px-4 border-b border-gray-200 z-20 shadow-sm">
                      <div className="flex items-center space-x-2">
                        <h4 className="text-sm font-medium text-red-600">{t('server.errorDetails')}</h4>
                        <button
                          onClick={copyToClipboard}
                          className="p-1 text-gray-400 hover:text-gray-600 transition-colors btn-secondary"
                          title={t('common.copy')}
                        >
                          {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                        </button>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setShowErrorPopover(false)
                        }}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="p-4 pt-2">
                      <pre className="text-sm text-gray-700 break-words whitespace-pre-wrap">{server.error}</pre>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex space-x-2">
            <button
              onClick={handleInstall}
              className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm btn-primary transition-colors shadow-sm"
              title={t('cursor.installToCursor')}
            >
              <div className="flex items-center">
                <Download size={12} className="mr-1" />
                {t('cursor.install')}
              </div>
            </button>
            <button
              onClick={handleEdit}
              className="px-3 py-1 bg-blue-100 text-blue-800 rounded hover:bg-blue-200 text-sm btn-primary"
            >
              {t('server.edit')}
            </button>
            <div className="flex items-center">
              <button
                onClick={handleToggle}
                className={`px-3 py-1 text-sm rounded transition-colors ${isToggling
                  ? 'bg-gray-200 text-gray-500'
                  : server.enabled !== false
                    ? 'bg-green-100 text-green-800 hover:bg-green-200 btn-secondary'
                    : 'bg-gray-100 text-gray-800 hover:bg-gray-200 btn-primary'
                  }`}
                disabled={isToggling}
              >
                {isToggling
                  ? t('common.processing')
                  : server.enabled !== false
                    ? t('server.disable')
                    : t('server.enable')
                }
              </button>
            </div>
            <button
              onClick={handleRemove}
              className="px-3 py-1 bg-red-100 text-red-800 rounded hover:bg-red-200 text-sm btn-danger"
            >
              {t('server.delete')}
            </button>
            <button className="text-gray-400 hover:text-gray-600 btn-secondary">
              {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            </button>
          </div>
        </div>

        {isExpanded && server.tools && (
          <div className="mt-6">
            <h6 className={`font-medium ${server.enabled === false ? 'text-gray-600' : 'text-gray-900'} mb-4`}>{t('server.tools')}</h6>
            <div className="space-y-4">
              {server.tools.map((tool, index) => (
                <ToolCard key={index} server={server.name} tool={tool} onToggle={handleToolToggle} />
              ))}
            </div>
          </div>
        )}
      </div>

      <DeleteDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleConfirmDelete}
        serverName={server.name}
      />

      {/* Install Modal */}
      {showInstallModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">
                {t('cursor.installServer', { name: server.name })}
              </h2>
              <button
                onClick={() => setShowInstallModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
              <div className="mb-6">
                <h3 className="text-lg font-medium text-gray-900 mb-3">
                  {t('cursor.mcpConfiguration')}
                </h3>
                <p className="text-gray-600 text-sm mb-4">
                  {t('cursor.configurationDescription')}
                </p>
                
                <div className="relative mb-6">
                  <pre className="bg-gray-50 rounded-lg p-4 text-sm overflow-x-auto border">
                    {configLoading ? (
                      <div className="flex items-center justify-center p-4">
                        <svg className="animate-spin h-5 w-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        {t('common.loading')}
                      </div>
                    ) : (
                      <code>{mcpConfig || '{}'}</code>
                    )}
                  </pre>
                  <button
                    onClick={copyConfigToClipboard}
                    className="absolute top-2 right-2 p-2 text-gray-400 hover:text-gray-600 transition-colors btn-secondary"
                    title={t('common.copy')}
                  >
                    {configCopied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                  </button>
                </div>

                {/* 标签页导航 */}
                <div className="flex border-b border-gray-200 mb-4">
                  <button
                    onClick={() => setActiveTab('cursor')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 ${
                      activeTab === 'cursor'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {t('cursor.cursorTab')}
                  </button>
                  <button
                    onClick={() => setActiveTab('claudeCode')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 ${
                      activeTab === 'claudeCode'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {t('cursor.claudeCodeTab')}
                  </button>
                  <button
                    onClick={() => setActiveTab('claudeDesktop')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 ${
                      activeTab === 'claudeDesktop'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {t('cursor.claudeDesktopTab')}
                  </button>
                </div>

                {/* 安装步骤内容 */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                  <h4 className="text-sm font-medium text-blue-900 mb-2">
                    {t('cursor.installationSteps')}
                  </h4>
                  
                  {/* Cursor 安装步骤 */}
                  {activeTab === 'cursor' && (
                    <ol className="text-sm text-blue-800 space-y-2">
                      <li className="flex items-start">
                        <span className="inline-block w-5 h-5 bg-blue-500 text-white text-xs rounded-full flex items-center justify-center mr-2 mt-0.5">1</span>
                        {t('cursor.step1')}
                      </li>
                      <li className="flex items-start">
                        <span className="inline-block w-5 h-5 bg-blue-500 text-white text-xs rounded-full flex items-center justify-center mr-2 mt-0.5">2</span>
                        {t('cursor.step2')}
                      </li>
                      <li className="flex items-start">
                        <span className="inline-block w-5 h-5 bg-blue-500 text-white text-xs rounded-full flex items-center justify-center mr-2 mt-0.5">3</span>
                        {t('cursor.step3')}
                      </li>
                      <li className="flex items-start">
                        <span className="inline-block w-5 h-5 bg-blue-500 text-white text-xs rounded-full flex items-center justify-center mr-2 mt-0.5">4</span>
                        {t('cursor.step4')}
                      </li>
                    </ol>
                  )}

                  {/* Claude Code 安装步骤 */}
                  {activeTab === 'claudeCode' && (
                    <ol className="text-sm text-blue-800 space-y-2">
                      <li className="flex items-start">
                        <span className="inline-block w-5 h-5 bg-blue-500 text-white text-xs rounded-full flex items-center justify-center mr-2 mt-0.5">1</span>
                        {t('cursor.claudeCodeStep1')}
                      </li>
                      <li className="flex items-start">
                        <span className="inline-block w-5 h-5 bg-blue-500 text-white text-xs rounded-full flex items-center justify-center mr-2 mt-0.5">2</span>
                        {t('cursor.claudeCodeStep2')}
                      </li>
                      <li className="flex items-start">
                        <span className="inline-block w-5 h-5 bg-blue-500 text-white text-xs rounded-full flex items-center justify-center mr-2 mt-0.5">3</span>
                        {t('cursor.claudeCodeStep3')}
                      </li>
                      <li className="flex items-start">
                        <span className="inline-block w-5 h-5 bg-blue-500 text-white text-xs rounded-full flex items-center justify-center mr-2 mt-0.5">4</span>
                        {t('cursor.claudeCodeStep4')}
                      </li>
                      <li className="flex items-start">
                        <span className="inline-block w-5 h-5 bg-blue-500 text-white text-xs rounded-full flex items-center justify-center mr-2 mt-0.5">5</span>
                        {t('cursor.claudeCodeStep5')}
                      </li>
                      <li className="flex items-start">
                        <span className="inline-block w-5 h-5 bg-blue-500 text-white text-xs rounded-full flex items-center justify-center mr-2 mt-0.5">6</span>
                        {t('cursor.claudeCodeStep6')}
                      </li>
                    </ol>
                  )}

                  {/* Claude Desktop 安装步骤 */}
                  {activeTab === 'claudeDesktop' && (
                    <ol className="text-sm text-blue-800 space-y-2">
                      <li className="flex items-start">
                        <span className="inline-block w-5 h-5 bg-blue-500 text-white text-xs rounded-full flex items-center justify-center mr-2 mt-0.5">1</span>
                        {t('cursor.claudeDesktopStep1')}
                      </li>
                      <li className="flex items-start">
                        <span className="inline-block w-5 h-5 bg-blue-500 text-white text-xs rounded-full flex items-center justify-center mr-2 mt-0.5">2</span>
                        <div>
                          <div>{t('cursor.claudeDesktopStep2')}</div>
                          <ul className="mt-1 ml-4 space-y-1">
                            <li className="text-xs font-mono">{t('cursor.claudeDesktopStep2Windows')}</li>
                            <li className="text-xs font-mono">{t('cursor.claudeDesktopStep2Mac')}</li>
                            <li className="text-xs font-mono">{t('cursor.claudeDesktopStep2Linux')}</li>
                          </ul>
                        </div>
                      </li>
                      <li className="flex items-start">
                        <span className="inline-block w-5 h-5 bg-blue-500 text-white text-xs rounded-full flex items-center justify-center mr-2 mt-0.5">3</span>
                        {t('cursor.claudeDesktopStep3')}
                      </li>
                      <li className="flex items-start">
                        <span className="inline-block w-5 h-5 bg-blue-500 text-white text-xs rounded-full flex items-center justify-center mr-2 mt-0.5">4</span>
                        {t('cursor.claudeDesktopStep4')}
                      </li>
                      <li className="flex items-start">
                        <span className="inline-block w-5 h-5 bg-blue-500 text-white text-xs rounded-full flex items-center justify-center mr-2 mt-0.5">5</span>
                        {t('cursor.claudeDesktopStep5')}
                      </li>
                    </ol>
                  )}
                </div>
              </div>

              <div className="flex justify-end space-x-4">
                <button
                  onClick={() => setShowInstallModal(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-200 rounded hover:bg-gray-300 btn-secondary transition-colors"
                >
                  {t('common.cancel')}
                </button>
                
                <button
                  onClick={copyConfigToClipboard}
                  className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 btn-secondary transition-colors flex items-center"
                >
                  <Copy size={16} className="mr-2" />
                  {t('cursor.copyConfiguration')}
                </button>

                {/* 根据标签页显示不同的按钮 */}
                {activeTab === 'cursor' && (
                  <button
                    onClick={installToCursor}
                    className="inline-flex items-center px-6 py-3 border border-transparent text-sm font-medium rounded-md text-white bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                    style={{
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      boxShadow: '0 4px 15px 0 rgba(116, 75, 162, 0.75)'
                    }}
                  >
                    <svg 
                      width="20" 
                      height="20" 
                      viewBox="0 0 24 24" 
                      fill="none" 
                      className="mr-2"
                    >
                      <path 
                        d="M12 2L2 7L12 12L22 7L12 2Z" 
                        stroke="currentColor" 
                        strokeWidth="2" 
                        strokeLinecap="round" 
                        strokeLinejoin="round"
                      />
                      <path 
                        d="M2 17L12 22L22 17" 
                        stroke="currentColor" 
                        strokeWidth="2" 
                        strokeLinecap="round" 
                        strokeLinejoin="round"
                      />
                      <path 
                        d="M2 12L12 17L22 12" 
                        stroke="currentColor" 
                        strokeWidth="2" 
                        strokeLinecap="round" 
                        strokeLinejoin="round"
                      />
                    </svg>
                    Add {server.name} MCP server to Cursor
                  </button>
                )}

                                {activeTab === 'claudeCode' && (
                  <button
                    onClick={copyClaudeCodeCommand}
                    className="inline-flex items-center px-6 py-3 border border-transparent text-sm font-medium rounded-md text-white bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                    style={{
                      background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                      boxShadow: '0 4px 15px 0 rgba(139, 92, 246, 0.75)'
                    }}
                  >
                    <Copy size={20} className="mr-2" />
                    Copy {server.name} MCP command for Claude Code
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default ServerCard