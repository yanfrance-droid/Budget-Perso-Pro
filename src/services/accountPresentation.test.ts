// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { 
  resolvePrimaryAccountId, 
  getAccountTypeLabel, 
  formatAccountOptionLabel 
} from './accountPresentation';
import type { Account } from '../db/database';

describe('accountPresentation — Identification des comptes et libellés', () => {
  const accounts: Account[] = [
    { id: 'acc-main', name: 'Boursorama Principal', type: 'checking', initialBalance: 1000, referenceDate: '2026-01-01', isClosed: false },
    { id: 'acc-sec', name: 'Revolut Quotidien', type: 'checking', initialBalance: 200, referenceDate: '2026-01-01', isClosed: false },
    { id: 'acc-livretA', name: 'Mon Livret A', type: 'savings', subType: 'livret_a', initialBalance: 3000, referenceDate: '2026-01-01', isClosed: false },
    { id: 'acc-pea', name: 'Plan Actions', type: 'savings', subType: 'pea', initialBalance: 5000, referenceDate: '2026-01-01', isClosed: false },
    { id: 'acc-custom', name: 'Coffre Or', type: 'savings', subType: 'Or Physique', initialBalance: 1000, referenceDate: '2026-01-01', isClosed: false },
    { id: 'acc-closed', name: 'Ancien Compte Clos', type: 'checking', initialBalance: 0, referenceDate: '2026-01-01', isClosed: true },
    { id: 'acc-cash', name: 'Portefeuille', type: 'cash', initialBalance: 50, referenceDate: '2026-01-01', isClosed: false }
  ];

  describe('resolvePrimaryAccountId', () => {
    it('utilise primaryAccountId configuré s\'il pointe vers un compte checking actif', () => {
      expect(resolvePrimaryAccountId(accounts, 'acc-sec')).toBe('acc-sec');
      expect(resolvePrimaryAccountId(accounts, 'acc-main')).toBe('acc-main');
    });

    it('ignore un primaryAccountId pointant vers un compte clôturé et se rabat sur le premier checking actif', () => {
      expect(resolvePrimaryAccountId(accounts, 'acc-closed')).toBe('acc-main');
    });

    it('ignore un primaryAccountId inexistant ou pointant vers un compte d\'épargne', () => {
      expect(resolvePrimaryAccountId(accounts, 'acc-livretA')).toBe('acc-main');
      expect(resolvePrimaryAccountId(accounts, 'non-existent')).toBe('acc-main');
    });

    it('se rabat déterministement sur le premier checking actif sans primaryAccountId (transition sûre)', () => {
      expect(resolvePrimaryAccountId(accounts, null)).toBe('acc-main');
      expect(resolvePrimaryAccountId(accounts, undefined)).toBe('acc-main');
    });

    it('retourne null si aucun compte checking actif n\'existe', () => {
      const savingsOnly: Account[] = [
        { id: 'acc-1', name: 'Livret', type: 'savings', initialBalance: 100, referenceDate: '2026-01-01', isClosed: false }
      ];
      expect(resolvePrimaryAccountId(savingsOnly, null)).toBeNull();
    });
  });

  describe('getAccountTypeLabel', () => {
    it('qualifie explicitement « Compte courant principal » pour le compte principal', () => {
      expect(getAccountTypeLabel(accounts[0], 'acc-main', accounts)).toBe('Compte courant principal');
    });

    it('qualifie explicitement « Compte courant secondaire » pour les autres comptes courants', () => {
      expect(getAccountTypeLabel(accounts[1], 'acc-main', accounts)).toBe('Compte courant secondaire');
    });

    it('qualifie un compte checking clôturé comme « Compte courant secondaire »', () => {
      expect(getAccountTypeLabel(accounts[5], 'acc-main', accounts)).toBe('Compte courant secondaire');
    });

    it('affiche le nom propre du type d\'épargne pour les livrets et plans', () => {
      expect(getAccountTypeLabel(accounts[2], 'acc-main', accounts)).toBe('Livret A');
      expect(getAccountTypeLabel(accounts[3], 'acc-main', accounts)).toBe('PEA — Plan d’épargne en actions');
      expect(getAccountTypeLabel(accounts[4], 'acc-main', accounts)).toBe('Or Physique');
    });

    it('affiche « Espèces / Manuel » pour un compte cash', () => {
      expect(getAccountTypeLabel(accounts[6], 'acc-main', accounts)).toBe('Espèces / Manuel');
    });
  });

  describe('formatAccountOptionLabel', () => {
    it('génère un libellé cohérent pour le compte principal', () => {
      expect(formatAccountOptionLabel(accounts[0], 'acc-main', accounts))
        .toBe('Boursorama Principal (Compte courant principal)');
    });

    it('génère un libellé cohérent pour le compte secondaire', () => {
      expect(formatAccountOptionLabel(accounts[1], 'acc-main', accounts))
        .toBe('Revolut Quotidien (Compte courant secondaire)');
    });

    it('conserve le nom et mentionne le statut clôturé', () => {
      expect(formatAccountOptionLabel(accounts[5], 'acc-main', accounts))
        .toBe('Ancien Compte Clos (Compte courant secondaire) (clôturé)');
    });
  });
});
