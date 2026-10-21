import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import ItensPedidoForm, { ITEM_VAZIO } from './ItensPedidoForm'

describe('SKU no item do pedido', () => {
  it('o item vazio já nasce com o campo sku', () => {
    expect(ITEM_VAZIO).toHaveProperty('sku', '')
  })

  it('digitar o SKU atualiza só aquele item', () => {
    const onChange = vi.fn()
    const itens = [{ ...ITEM_VAZIO, produto: 'Cabo A' }, { ...ITEM_VAZIO, produto: 'Cabo B' }]
    render(<ItensPedidoForm itens={itens} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('SKU do item 2'), { target: { value: 'FV0073' } })
    expect(onChange).toHaveBeenCalledWith([itens[0], { ...itens[1], sku: 'FV0073', sku_origem: null }])
  })

  it('SKU sugerido pela leitura aparece marcado para conferir', () => {
    render(<ItensPedidoForm itens={[{ ...ITEM_VAZIO, produto: 'Fonte', sku: '1017', sku_origem: 'sugerido' }]} onChange={() => {}} />)
    expect(screen.getByText('sugerido, confira')).toBeInTheDocument()
  })

  it('o SKU é opcional: nenhum campo dele é obrigatório', () => {
    render(<ItensPedidoForm itens={[{ ...ITEM_VAZIO }]} onChange={() => {}} />)
    expect(screen.getByLabelText('SKU do item 1')).not.toBeRequired()
  })

  it('itens lidos de um pedido antigo, sem a chave sku, não quebram a tela', () => {
    render(<ItensPedidoForm itens={[{ produto: 'X', quantidade: 1, valor_unitario: 2 }]} onChange={() => {}} />)
    expect(screen.getByLabelText('SKU do item 1')).toHaveValue('')
  })
})
