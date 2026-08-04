import axios from 'axios'
import { getSession } from './auth'

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL })

api.interceptors.request.use(async (config) => {
  const session = await getSession()
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`
  }
  return config
})

export default api
