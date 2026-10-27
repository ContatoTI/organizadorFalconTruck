'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/src/lib/supabase/Client';
import { useRouter } from 'next/navigation';
import { Plus, Edit2, Trash2, Wallet, TrendingUp, TrendingDown } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import type { Finance } from '@/types/index';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { PageShell, PageHeader, EmptyState, ListCard, ListRow, RowAction, PageSkeleton } from '@/src/components/ui/Page';
import { cn } from '@/src/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useToast } from '@/src/components/Toast';
import { chamarApi } from '@/src/lib/chamarApi';
import { calcularResumo, type TipoLancamento } from '@/src/models/financas/lancamentos';

const API = '/api/financas';

const formularioVazio = () => ({
  description: '',
  amount: '',
  type: 'expense' as TipoLancamento,
  category: '',
  date: new Date().toISOString().split('T')[0],
});

const brl = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function PaginaFinancas() {
  const [user, setUser] = useState<User | null>(null);
  const [transactions, setTransactions] = useState<Finance[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Finance | null>(null);
  const [formData, setFormData] = useState(formularioVazio);
  const router = useRouter();
  const { toast } = useToast();
  const [client] = useState(createClient);

  useEffect(() => {
    client.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push('/login');
        return;
      }
      setUser(user);
    });
  }, [client, router]);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      setTransactions(await chamarApi<Finance[]>(API));
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (user) fetchTransactions();
  }, [user, fetchTransactions]);

  // ponytail: realtime em finance_transactions — reflete mudanças de outras abas/dispositivos sem refresh.
  useEffect(() => {
    if (!user) return;
    const channel = client
      .channel('finances-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'finance_transactions', filter: `user_id=eq.${user.id}` },
        () => fetchTransactions()
      )
      .subscribe();
    return () => { client.removeChannel(channel); };
  }, [user, client, fetchTransactions]);

  const resetForm = () => {
    setShowForm(false);
    setEditingTransaction(null);
    setFormData(formularioVazio());
  };

  const saveTransaction = async () => {
    if (!formData.description.trim() || !formData.amount || !user) return;

    try {
      if (editingTransaction) {
        const salvo = await chamarApi<Finance>(`${API}/${editingTransaction.id}`, { method: 'PATCH', json: formData });
        setTransactions(lista => lista.map(t => t.id === salvo.id ? salvo : t));
      } else {
        const criado = await chamarApi<Finance>(API, { method: 'POST', json: formData });
        setTransactions(lista => [criado, ...lista]);
      }
      resetForm();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const deleteTransaction = async (id: number) => {
    try {
      await chamarApi(`${API}/${id}`, { method: 'DELETE' });
      setTransactions(lista => lista.filter(t => t.id !== id));
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const editTransaction = (transaction: Finance) => {
    setEditingTransaction(transaction);
    setFormData({
      description: transaction.description,
      amount: transaction.amount.toString(),
      type: transaction.type,
      category: transaction.category || '',
      date: transaction.date,
    });
    setShowForm(true);
  };

  const { receitas, despesas, saldo } = calcularResumo(transactions);

  if (!user) {
    return <PageShell><PageSkeleton /></PageShell>;
  }

  const summary = [
    { label: 'Receitas', value: receitas, icon: TrendingUp, tone: 'cat-green-soft', text: 'text-cat-green' },
    { label: 'Despesas', value: despesas, icon: TrendingDown, tone: 'cat-red-soft', text: 'text-cat-red' },
    { label: 'Saldo', value: saldo, icon: Wallet, tone: 'bg-primary/10 text-primary', text: saldo >= 0 ? 'text-cat-green' : 'text-cat-red' },
  ];

  return (
    <PageShell>
      <PageHeader
        icon={Wallet}
        title="Finanças"
        subtitle={`${transactions.length} lançamento${transactions.length === 1 ? '' : 's'} no período`}
        actions={
          <Button size="sm" onClick={() => { resetForm(); setShowForm(true); }} className="h-8 gap-1.5 text-[13px]">
            <Plus className="w-4 h-4" /> Nova transação
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        {summary.map(({ label, value, icon: Icon, tone, text }) => (
          <Card key={label} className="p-3.5">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={cn('w-7 h-7 rounded-lg grid place-items-center', tone)}>
                <Icon className="w-3.5 h-3.5" />
              </span>
              <span className="text-[12px] font-medium text-muted-foreground">{label}</span>
            </div>
            <p className={cn('text-[19px] font-semibold tabular-nums', text)}>{brl(value)}</p>
          </Card>
        ))}
      </div>

      {loading ? (
        <PageSkeleton rows={4} />
      ) : transactions.length === 0 ? (
        <ListCard>
          <EmptyState
            icon={Wallet}
            title="Nenhuma transação registrada."
            hint="Lance suas receitas e despesas para ver o saldo."
            action={
              <Button size="sm" onClick={() => { resetForm(); setShowForm(true); }} className="h-8 gap-1.5 text-[13px]">
                <Plus className="w-4 h-4" /> Lançar a primeira
              </Button>
            }
          />
        </ListCard>
      ) : (
        <ListCard>
          {transactions.map((transaction) => {
            const income = transaction.type === 'income';
            return (
              <ListRow key={transaction.id}>
                <span className={cn('w-8 h-8 rounded-lg grid place-items-center shrink-0', income ? 'cat-green-soft' : 'cat-red-soft')}>
                  {income ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13.5px] font-medium truncate leading-5">{transaction.description}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {transaction.category && (
                      <span className="text-[10.5px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                        {transaction.category}
                      </span>
                    )}
                    <span className="text-[11px] text-muted-foreground/70 tabular-nums">
                      {new Date(transaction.date + 'T00:00:00').toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                </div>
                <p className={cn('text-[13.5px] font-semibold tabular-nums shrink-0', income ? 'text-cat-green' : 'text-cat-red')}>
                  {income ? '+' : '−'}{brl(transaction.amount)}
                </p>
                <RowAction icon={Edit2} label="Editar transação" onClick={() => editTransaction(transaction)} />
                <RowAction icon={Trash2} label="Excluir transação" danger onClick={() => deleteTransaction(transaction.id)} />
              </ListRow>
            );
          })}
        </ListCard>
      )}

      <Dialog open={showForm} onOpenChange={(open) => !open && resetForm()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTransaction ? 'Editar' : 'Nova'} Transação</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label>Descrição</Label>
              <Input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Descrição da transação"
                autoFocus
              />
            </div>

            <div>
              <Label>Valor</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                placeholder="0.00"
              />
            </div>

            <div>
              <Label>Tipo</Label>
              <Select
                value={formData.type}
                onValueChange={(val) => setFormData({ ...formData, type: val as TipoLancamento })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">Despesa</SelectItem>
                  <SelectItem value="income">Receita</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Categoria (opcional)</Label>
              <Input
                type="text"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                placeholder="Ex: Alimentação, Transporte..."
              />
            </div>

            <div>
              <Label>Data</Label>
              <Input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={resetForm}>Cancelar</Button>
            <Button onClick={saveTransaction}>{editingTransaction ? 'Salvar' : 'Adicionar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
