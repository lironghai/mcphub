import { getApiUrl } from '@/utils/runtime'

interface SearchTool {
  name: string
  description: string
  inputSchema: any
  serverName?: string
  similarity?: number
}

interface SearchResult {
  tools: SearchTool[]
  metadata: {
    query: string
    threshold: number
    totalResults: number
    guideline: string
    nextSteps: string
  }
}

/**
 * 搜索工具 - 使用后端API接口
 */
export const searchTools = async (
  query: string,
  limit: number = 10,
  threshold: number = 0.65
): Promise<{ success: boolean; data?: SearchResult; error?: string }> => {
  try {
    const token = localStorage.getItem('mcphub_token')
    
    // 调用后端搜索API
    const response = await fetch(getApiUrl('/tools/search'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-auth-token': token || ''
      },
      body: JSON.stringify({
        query: query,
        limit: limit,
        threshold: threshold
      })
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const data = await response.json()
    
    if (!data.success) {
      return {
        success: false,
        error: data.message || '搜索失败'
      }
    }

    return {
      success: true,
      data: data.data
    }
  } catch (error) {
    console.error('搜索工具失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '搜索失败'
    }
  }
}

/**
 * 根据搜索结果获取对应的服务器列表
 */
export const getServersFromSearchResults = (searchResults: SearchTool[], allServers: any[]): any[] => {
  if (!searchResults || searchResults.length === 0) {
    return []
  }

  // 提取搜索结果中的服务器名称
  const serverNames = new Set<string>()
  searchResults.forEach(tool => {
    if (tool.serverName) {
      serverNames.add(tool.serverName)
    }
    // 有些工具名可能包含服务器名前缀，如 "serverName/toolName"
    if (tool.name && tool.name.includes('/')) {
      const parts = tool.name.split('/')
      if (parts.length >= 2) {
        serverNames.add(parts[0])
      }
    }
  })

  // 根据服务器名称筛选出相关的服务器
  return allServers.filter(server => 
    serverNames.has(server.name) || 
    searchResults.some(tool => 
      server.tools?.some((serverTool: any) => 
        serverTool.name === tool.name || 
        (tool.name && tool.name.endsWith(`/${serverTool.name}`))
      )
    )
  )
}

/**
 * 从搜索响应中获取服务器数据（如果API返回了servers字段）
 */
export const getServersFromSearchResponse = (searchData: any, allServers: any[]): any[] => {
  // 如果API返回了servers字段，使用它来筛选并保持后端排序
  if (searchData.servers && Array.isArray(searchData.servers)) {
    const serverMap = new Map(allServers.map(server => [server.name, server]));
    
    // 按照后端返回的顺序构建服务器列表
    return searchData.servers
      .map((searchServer: any) => serverMap.get(searchServer.serverName))
      .filter(Boolean) // 过滤掉找不到的服务器
  }
  
  // 否则使用原来的方法
  return getServersFromSearchResults(searchData.tools || [], allServers)
} 