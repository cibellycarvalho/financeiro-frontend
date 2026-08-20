/**
 * Cliente para o backend do CRM.
 *
 * A tela de Lucro Real mora aqui no Painel, mas o CÁLCULO ficou no CRM: ele
 * depende da integração com o Mercado Livre (faturamento, taxas, CMV,
 * cancelados), que só existe lá. Duplicar essa integração seria manter duas
 * cópias da parte mais complexa do sistema, divergindo com o tempo.
 *
 * O mesmo vale para o estoque mensal, que é capturado do ML na hora.
 *
 * Usa o MESMO token do Supabase que o resto do Painel — os dois backends
 * validam o mesmo login. É por isso que ninguém precisa entrar duas vezes.
 */
import axios from 'axios'

import { getSession } from './auth'

const baseURL = import.meta.env.VITE_CRM_API_URL

const crmApi = axios.create({ baseURL })

crmApi.interceptors.request.use(async (config) => {
  const session = await getSession()
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`
  }
  return config
})

/** Endereço não configurado é falha de configuração, não de rede — vale dizer
    com todas as letras em vez de deixar o erro genérico do axios aparecer. */
export function crmConfigurado() {
  return Boolean(baseURL)
}

export default crmApi
