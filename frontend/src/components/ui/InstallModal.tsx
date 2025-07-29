import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/contexts/ToastContext';
import { Copy, Check, Download } from '@/components/icons/LucideIcons';

interface InstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverName: string;
  serverConfig?: any;
  customConfig?: string; // 添加自定义配置支持
  onInstall?: (config: any) => Promise<void>;
  title?: string;
}

const InstallModal: React.FC<InstallModalProps> = ({
  isOpen,
  onClose,
  serverName,
  serverConfig,
  customConfig, // 新增参数
  onInstall,
  title
}) => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [configCopied, setConfigCopied] = useState(false);
  const [mcpConfig, setMcpConfig] = useState<string>('');
  const [configLoading, setConfigLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'cursor' | 'claudeCode' | 'claudeDesktop'>('cursor');

  useEffect(() => {
    if (isOpen) {
      // 如果有自定义配置，直接使用；否则生成配置
      if (customConfig) {
        setMcpConfig(customConfig);
      } else if (!mcpConfig) {
        loadMcpConfig();
      }
    }
  }, [isOpen, customConfig]);

  // 生成单个服务器的MCP配置
  const generateSingleServerConfig = async () => {
    try {
      const { getApiUrl } = await import('@/utils/runtime');
      const token = localStorage.getItem('mcphub_token');
      
      // 获取完整的设置配置
      const response = await fetch(getApiUrl('/settings'), {
        headers: {
          'x-auth-token': token || ''
        }
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data && result.data.mcpServers && result.data.mcpServers[serverName]) {
          const serverSettings = result.data.mcpServers[serverName];
          
          return serverSettings;
        }
      }
    } catch (error) {
      console.error('Error fetching server settings:', error);
    }
    
    // 如果无法获取实际配置，使用传入的配置或生成默认配置
    if (serverConfig) {
      return serverConfig;
    }
    
    // 默认配置，使用标准MCP包名
    return {
      command: 'npx',
      args: ['-y', `@modelcontextprotocol/server-${serverName}`]
    };
  };

  // 为Cursor深度链接生成配置（特殊格式）
  const generateCursorDeepLinkConfig = async (): Promise<any> => {
    try {
      const { getApiUrl } = await import('@/utils/runtime');
      const token = localStorage.getItem('mcphub_token');
      
      // 获取完整的设置配置
      const response = await fetch(getApiUrl('/settings'), {
        headers: {
          'x-auth-token': token || ''
        }
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data && result.data.mcpServers && result.data.mcpServers[serverName]) {
          const serverSettings = result.data.mcpServers[serverName];
          
          // 对于stdio模式，Cursor深度链接需要单一command字符串格式
          if (serverSettings.command && (!serverSettings.type || serverSettings.type === 'stdio')) {
            // 将command和args合并为单一字符串
            const fullCommand = serverSettings.args && serverSettings.args.length > 0
              ? `${serverSettings.command} ${serverSettings.args.join(' ')}`
              : `${serverSettings.command} -y @modelcontextprotocol/server-${serverName}`;
            
            const config: any = {
              command: fullCommand
            };
            
            // 添加环境变量（如果有）
            if (serverSettings.env && Object.keys(serverSettings.env).length > 0) {
              config.env = serverSettings.env;
            }
            
            return config;
          }
          
          // 对于其他类型（sse, streamable-http），直接返回原配置
          return serverSettings;
        }
      }
    } catch (error) {
      console.error('Error fetching server settings:', error);
    }
    
    // 如果无法获取实际配置，使用传入的配置或生成默认配置
    if (serverConfig) {
      // 对于stdio模式，转换为Cursor格式
      if (!serverConfig.type || serverConfig.type === 'stdio') {
        const command = serverConfig.command || 'npx';
        const args = serverConfig.args || ['-y', `@modelcontextprotocol/server-${serverName}`];
        const fullCommand = `${command} ${args.join(' ')}`;
        
        const config: any = { command: fullCommand };
        if (serverConfig.env && Object.keys(serverConfig.env).length > 0) {
          config.env = serverConfig.env;
        }
        return config;
      }
      
      return serverConfig;
    }
    
    // 默认配置，使用Cursor深度链接格式
    return {
      command: `npx -y @modelcontextprotocol/server-${serverName}`
    };
  };

  // 生成MCP配置JSON
  const generateMcpConfig = async () => {
    const singleConfig = await generateSingleServerConfig();
    
    const mcpConfig = {
      mcpServers: {
        [serverName]: singleConfig
      }
    };
    
    return JSON.stringify(mcpConfig, null, 2);
  };

  // 加载MCP配置
  const loadMcpConfig = async () => {
    setConfigLoading(true);
    try {
      const config = await generateMcpConfig();
      setMcpConfig(config);
    } catch (error) {
      console.error('Error loading MCP config:', error);
      setMcpConfig('{}');
    } finally {
      setConfigLoading(false);
    }
  };

  // 复制配置到剪贴板
  const copyConfigToClipboard = async () => {
    if (!mcpConfig && !configLoading) {
      await loadMcpConfig();
    }
    
    const config = mcpConfig || '{}';
    
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(config);
        setConfigCopied(true);
        showToast(t('common.copySuccess'), 'success');
        setTimeout(() => setConfigCopied(false), 2000);
      } catch (err) {
        showToast(t('common.copyFailed'), 'error');
      }
    } else {
      // Fallback for HTTP or unsupported clipboard API
      const textArea = document.createElement('textarea');
      textArea.value = config;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
        setConfigCopied(true);
        showToast(t('common.copySuccess'), 'success');
        setTimeout(() => setConfigCopied(false), 2000);
      } catch (err) {
        showToast(t('common.copyFailed'), 'error');
      }
      document.body.removeChild(textArea);
    }
  };

  // 复制Claude Code命令
  const copyClaudeCodeCommand = async () => {
    let command;
    
    // 如果有自定义配置（分组安装），生成对应的命令
    if (customConfig) {
      try {
        const parsedConfig = JSON.parse(customConfig);
        if (parsedConfig.mcpServers && Object.keys(parsedConfig.mcpServers).length > 0) {
          // 对于分组配置，生成添加整个配置的命令
          const configJson = JSON.stringify(parsedConfig, null, 2);
          command = `claude mcp add-json "${serverName}-group" '${configJson.replace(/'/g, "\\'")}'`;
        } else {
          command = `claude mcp add-json "${serverName}" '{"command": "npx", "args": ["-y", "${serverName}"]}'`;
        }
      } catch (e) {
        console.error('Error parsing custom config:', e);
        command = `claude mcp add-json "${serverName}" '{"command": "npx", "args": ["-y", "${serverName}"]}'`;
      }
    } else {
      // 单服务器配置
      const configForCommand = await generateSingleServerConfig();
      const configJson = JSON.stringify(configForCommand, null, 2);
      command = `claude mcp add-json "${serverName}" '${configJson.replace(/'/g, "\\'")}'`;
    }
    
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(command);
        showToast(t('common.copySuccess'), 'success');
      } catch (err) {
        showToast(t('common.copyFailed'), 'error');
      }
    } else {
      // Fallback
      const textArea = document.createElement('textarea');
      textArea.value = command;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
        showToast(t('common.copySuccess'), 'success');
      } catch (err) {
        showToast(t('common.copyFailed'), 'error');
      }
      document.body.removeChild(textArea);
    }
  };

  // 尝试使用Cursor深度链接安装
  const tryDeepLinkInstall = async () => {
    try {
      let configForLink;
      let nameForLink = serverName;
      
      // 如果有自定义配置（分组安装），需要特殊处理
      if (customConfig) {
        try {
          const parsedConfig = JSON.parse(customConfig);
          
          // 检查是否是分组配置（包含mcpServers）
          if (parsedConfig.mcpServers && Object.keys(parsedConfig.mcpServers).length > 0) {
            // 分组配置：使用第一个（通常是唯一的）MCPHub服务器配置
            const firstServerName = Object.keys(parsedConfig.mcpServers)[0];
            const firstServerConfig = parsedConfig.mcpServers[firstServerName];
            nameForLink = firstServerName;
            
            // 对于分组配置，通常是SSE类型的MCPHub服务器
            configForLink = firstServerConfig;
          } else {
            // 单服务器配置：检查是否需要转换为Cursor格式
            if (parsedConfig.command && parsedConfig.args) {
              const config: any = {
                command: `${parsedConfig.command} ${parsedConfig.args.join(' ')}`
              };
              if (parsedConfig.env) {
                config.env = parsedConfig.env;
              }
              configForLink = config;
            } else {
              configForLink = parsedConfig;
            }
          }
        } catch (e) {
          console.error('Error parsing custom config:', e);
          configForLink = { command: `npx -y @modelcontextprotocol/server-${serverName}` };
        }
      } else {
        // 单服务器配置：使用专门的Cursor深度链接配置生成器
        configForLink = await generateCursorDeepLinkConfig();
      }
      
      // 根据Cursor文档，config参数应该是单个服务器的配置，不需要mcpServers包装
      const configJson = JSON.stringify(configForLink);
      const encodedConfig = btoa(configJson);
      
      // 生成正确的深度链接
      const deepLink = `cursor://anysphere.cursor-deeplink/mcp/install?name=${encodeURIComponent(nameForLink)}&config=${encodeURIComponent(encodedConfig)}`;
      
      const a = document.createElement('a');
      a.href = deepLink;
      a.click();
      
      showToast(t('cursor.deepLinkOpened'), 'success');
      return true;
    } catch (error) {
      console.error('Deep link installation failed:', error);
      return false;
    }
  };

  // 安装到Cursor
  const installToCursor = async () => {
    try {
      const deepLinkSuccess = await tryDeepLinkInstall();
      
      if (!deepLinkSuccess) {
        showToast(t('cursor.deepLinkFailed'), 'error');
      }
    } catch (error) {
      console.error('Error installing to Cursor:', error);
      showToast(t('cursor.installFailed'), 'error');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        <div className="flex justify-between items-center p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            {title || t('cursor.installServer', { name: serverName })}
          </h2>
          <button
            onClick={onClose}
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
              onClick={onClose}
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
                Add {serverName} MCP server to Cursor
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
                Copy {serverName} MCP command for Claude Code
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default InstallModal; 