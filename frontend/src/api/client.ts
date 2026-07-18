import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || '/v1'

export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  // Content-Type은 axios가 요청 body에 맞게 자동 설정
  // (JSON → application/json, FormData → multipart/form-data)
})

// 요청 인터셉터 — JWT 토큰 자동 첨부
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  const workspaceId = localStorage.getItem('active_workspace_id')
  if (workspaceId) config.headers['X-Workspace-ID'] = workspaceId
  return config
})

// 응답 인터셉터 — 토큰 만료 처리
apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('access_token')
      window.location.href = '/'
    }
    return Promise.reject(error)
  }
)
