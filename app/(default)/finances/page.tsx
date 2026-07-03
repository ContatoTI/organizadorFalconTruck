'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/app/lib/supabase/Client';
import { useRouter } from 'next/navigation';
import { Plus, X, Edit2, Trash2, Wallet, TrendingUp, TrendingDown } from 'lucide-react';
import type { Finance } from '@/types/index';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

export default function FinancesPage() {
  const [user, setUser] = useState<any>(null);
  const [transactions, setTransactions] = useState<Finance[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Finance | null>(null);
  const [formData, setFormData] = useState({
    description: '',
    amount: '',
    type: 'expense' as 'income' | 'expense',
    category: '',
    date: new Date().toISOString().split('T')[0],
  });
  const router = useRouter();
  const client = createClient();

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await client.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setUser(user);
    };
    getUser();
  }, []);

  useEffect(() => {
    if (user) {
      fetchTransactions();
    }
  }, [user]);

  const fetchTransactions = async () => {
    if (!user) return;
    setLoading(true);

    const { data } = await client
      .from('finance_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: false });

    if (data) setTransactions(data as Finance[]);
    setLoading(false);
  };

  const saveTransaction = async () => {
    if (!formData.description.trim() || !formData.amount || !user) return;

    const transactionData = {
      user_id: user.id,
      description: formData.description,
      amount: parseFloat(formData.amount),
      type: formData.type,
      category: formData.category || null,
      date: formData.date,
    };

    if (editingTransaction) {
      await client.from('finance_transactions').update(transactionData).eq('id', editingTransaction.id);
      setTransactions(transactions.map(t => t.id === editingTransaction.id ? { ...t, ...transactionData } as Finance : t));
    } else {
      const { data } = await client.from('finance_transactions').insert(transactionData).select().single();
      if (data) setTransactions([data as Finance, ...transactions]);
    }

    resetForm();
  };

  const deleteTransaction = async (id: number) => {
    await client.from('finance_transactions').delete().eq('id', id);
    setTransactions(transactions.filter(t => t.id !== id));
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

  const resetForm = () => {
    setShowForm(false);
    setEditingTransaction(null);
    setFormData({
      description: '',
      amount: '',
      type: 'expense',
      category: '',
      date: new Date().toISOString().split('T')[0],
    });
  };

  const totalIncome = transactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpense = transactions
    .filter(t => t.type !== 'income')
    .reduce((sum, t) => sum + t.amount, 0);

  const balance = totalIncome - totalExpense;

  if (!user) {
    return <div className="p-6">Carregando...</div>;
  }

  return (
    <div className="p-6 w-full max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Wallet className="w-8 h-8" />
          Finanças
        </h1>
        <Button onClick={() => { resetForm(); setShowForm(true); }} className="flex items-center gap-2">
          <Plus className="w-5 h-5" />
          Nova Transação
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <Card className="p-4 shadow-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg cat-green-soft flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
            <span className="text-sm font-medium text-muted-foreground">Receitas</span>
          </div>
          <p className="text-2xl font-bold text-foreground">
            {totalIncome.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </p>
        </Card>
        <Card className="p-4 shadow-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg cat-red-soft flex items-center justify-center">
              <TrendingDown className="w-4 h-4" />
            </div>
            <span className="text-sm font-medium text-muted-foreground">Despesas</span>
          </div>
          <p className="text-2xl font-bold text-foreground">
            {totalExpense.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </p>
        </Card>
        <Card className="p-4 shadow-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-sidebar-accent flex items-center justify-center">
              <Wallet className="w-4 h-4 text-sidebar-primary" />
            </div>
            <span className="text-sm font-medium text-muted-foreground">Saldo</span>
          </div>
          <p className={`text-2xl font-bold ${balance >= 0 ? 'text-cat-green' : 'text-cat-red'}`}>
            {balance.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </p>
        </Card>
      </div>

      <div className="space-y-2">
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Carregando...</div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground bg-muted/20 rounded-xl border border-dashed border-border">
            <p>Nenhuma transação encontrada.</p>
            <p className="text-sm mt-2">Registre suas receitas e despesas.</p>
          </div>
        ) : (
          transactions.map((transaction) => (
            <Card key={transaction.id} className="flex items-center gap-4 p-4 shadow-xs hover:shadow-card transition-shadow">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                transaction.type === 'income' ? 'cat-green-soft' : 'cat-red-soft'
              }`}>
                {transaction.type === 'income' ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
              </div>
              <div className="flex-1">
                <p className="font-medium">{transaction.description}</p>
                <div className="flex gap-2 mt-1">
                  {transaction.category && (
                    <span className="text-xs bg-muted px-2 py-0.5 rounded">{transaction.category}</span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {new Date(transaction.date).toLocaleDateString('pt-BR')}
                  </span>
                </div>
              </div>
              <p className={`font-bold ${transaction.type === 'income' ? 'text-cat-green' : 'text-cat-red'}`}>
                {transaction.type === 'income' ? '+' : '-'}
                {transaction.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
              <Button variant="ghost" size="sm" onClick={() => editTransaction(transaction)} className="text-muted-foreground hover:text-primary">
                <Edit2 className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => deleteTransaction(transaction.id)} className="text-muted-foreground hover:text-destructive">
                <Trash2 className="w-4 h-4" />
              </Button>
            </Card>
          ))
        )}
      </div>

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
                onValueChange={(val) => setFormData({ ...formData, type: val as 'income' | 'expense' })}
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
    </div>
  );
}
