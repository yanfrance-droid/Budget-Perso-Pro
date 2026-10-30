import { describe, it, expect } from 'vitest';
import { 
  calculateRealBalance, 
  calculateAvailableBalance, 
  calculateForecastedBalance,
  getTransactionImpact
} from './calculations';
import type { Account, Transaction } from '../db/database';

describe('Virements internes et conservation rigoureuse des soldes', () => {
  const accountLivretA: Account = {
    id: 'acc-livretA',
    name: 'Livret A',
    type: 'savings',
    subType: 'livret_a',
    initialBalance: 1000,
    referenceDate: '2026-01-01',
    isClosed: false
  };

  const accountLep: Account = {
    id: 'acc-lep',
    name: 'LEP',
    type: 'savings',
    subType: 'lep',
    initialBalance: 2000,
    referenceDate: '2026-01-01',
    isClosed: false
  };

  const accountSec: Account = {
    id: 'acc-sec',
    name: 'Compte Secondaire',
    type: 'checking',
    initialBalance: 500,
    referenceDate: '2026-01-01',
    isClosed: false
  };

  const accountMain: Account = {
    id: 'acc-main',
    name: 'Compte Principal',
    type: 'checking',
    initialBalance: 3000,
    referenceDate: '2026-01-01',
    isClosed: false
  };

  describe('1. Virement interne entre deux comptes d\'épargne (Livret A -> LEP)', () => {
    it('statut "pending" (en attente) : préserve la conservation stricte des soldes prévisionnels et consolidés', () => {
      const txPending: Transaction = {
        id: 'tx-1',
        date: '2026-10-15',
        type: 'transfer',
        amount: 250,
        status: 'pending',
        accountId: 'acc-livretA',
        destinationAccountId: 'acc-lep'
      };

      const transactions = [txPending];

      // 1. Soldes réels (uniquement 'cleared') : aucun mouvement pointé
      expect(calculateRealBalance(accountLivretA, transactions)).toBe(1000);
      expect(calculateRealBalance(accountLep, transactions)).toBe(2000);
      expect(calculateRealBalance(accountLivretA, transactions) + calculateRealBalance(accountLep, transactions)).toBe(3000);

      // 2. Soldes disponibles ('cleared' + 'pending') :
      // Sortie de 250 sur Livret A -> 750
      // Entrée de 250 sur LEP -> 2250
      expect(calculateAvailableBalance(accountLivretA, transactions)).toBe(750);
      expect(calculateAvailableBalance(accountLep, transactions)).toBe(2250);
      // Total consolidé strictement inchangé : 750 + 2250 = 3000 € (zéro création / destruction d'argent)
      expect(calculateAvailableBalance(accountLivretA, transactions) + calculateAvailableBalance(accountLep, transactions)).toBe(3000);

      // 3. Soldes prévisionnels ('cleared' + 'pending' + 'planned')
      expect(calculateForecastedBalance(accountLivretA, transactions)).toBe(750);
      expect(calculateForecastedBalance(accountLep, transactions)).toBe(2250);
      expect(calculateForecastedBalance(accountLivretA, transactions) + calculateForecastedBalance(accountLep, transactions)).toBe(3000);
    });

    it('statut "cleared" (effectué) : impacte les soldes réels sans altérer le total consolidé', () => {
      const txCleared: Transaction = {
        id: 'tx-2',
        date: '2026-10-10',
        type: 'transfer',
        amount: 250,
        status: 'cleared',
        accountId: 'acc-livretA',
        destinationAccountId: 'acc-lep'
      };

      const transactions = [txCleared];

      expect(calculateRealBalance(accountLivretA, transactions)).toBe(750);
      expect(calculateRealBalance(accountLep, transactions)).toBe(2250);
      expect(calculateRealBalance(accountLivretA, transactions) + calculateRealBalance(accountLep, transactions)).toBe(3000);

      expect(calculateForecastedBalance(accountLivretA, transactions)).toBe(750);
      expect(calculateForecastedBalance(accountLep, transactions)).toBe(2250);
      expect(calculateForecastedBalance(accountLivretA, transactions) + calculateForecastedBalance(accountLep, transactions)).toBe(3000);
    });

    it('statut "planned" (prévu) : n\'impacte pas le solde réel mais impacte le solde prévisionnel de façon équilibrée', () => {
      const txPlanned: Transaction = {
        id: 'tx-3',
        date: '2026-10-25',
        type: 'transfer',
        amount: 100,
        status: 'planned',
        accountId: 'acc-livretA',
        destinationAccountId: 'acc-lep'
      };

      const transactions = [txPlanned];

      // Réel et disponible intacts
      expect(calculateRealBalance(accountLivretA, transactions)).toBe(1000);
      expect(calculateAvailableBalance(accountLivretA, transactions)).toBe(1000);

      // Prévisionnel débité sur la source et crédité sur la destination
      expect(calculateForecastedBalance(accountLivretA, transactions)).toBe(900);
      expect(calculateForecastedBalance(accountLep, transactions)).toBe(2100);
      expect(calculateForecastedBalance(accountLivretA, transactions) + calculateForecastedBalance(accountLep, transactions)).toBe(3000);
    });

    it('statut "disabled" (annulé) : aucun impact sur aucun solde', () => {
      const txDisabled: Transaction = {
        id: 'tx-4',
        date: '2026-10-25',
        type: 'transfer',
        amount: 500,
        status: 'disabled',
        accountId: 'acc-livretA',
        destinationAccountId: 'acc-lep'
      };

      const transactions = [txDisabled];

      expect(calculateRealBalance(accountLivretA, transactions)).toBe(1000);
      expect(calculateAvailableBalance(accountLivretA, transactions)).toBe(1000);
      expect(calculateForecastedBalance(accountLivretA, transactions)).toBe(1000);
      expect(calculateForecastedBalance(accountLep, transactions)).toBe(2000);
    });
  });

  describe('2. Virement d\'un compte d\'épargne vers un compte courant secondaire (Livret A -> Compte Sec)', () => {
    it('débite l\'épargne et crédite le compte secondaire sans toucher au compte principal', () => {
      const tx: Transaction = {
        id: 'tx-sec',
        date: '2026-10-18',
        type: 'transfer',
        amount: 150,
        status: 'pending',
        accountId: 'acc-livretA',
        destinationAccountId: 'acc-sec'
      };

      const transactions = [tx];

      // Livret A prévisionnel : 1000 - 150 = 850 €
      expect(calculateForecastedBalance(accountLivretA, transactions)).toBe(850);
      // Compte Secondaire prévisionnel : 500 + 150 = 650 €
      expect(calculateForecastedBalance(accountSec, transactions)).toBe(650);
      // Compte Principal prévisionnel : strictement 3000 € (TOTALEMENT NEUTRE)
      expect(calculateForecastedBalance(accountMain, transactions)).toBe(3000);

      // Total consolidé des deux comptes concernés : 850 + 650 = 1500 € (égal à 1000 + 500)
      expect(calculateForecastedBalance(accountLivretA, transactions) + calculateForecastedBalance(accountSec, transactions)).toBe(1500);
    });
  });

  describe('3. Virement vers le compte courant principal (Livret A -> Compte Principal)', () => {
    it('débite l\'épargne et crédite le compte principal de manière symétrique', () => {
      const tx: Transaction = {
        id: 'tx-main',
        date: '2026-10-18',
        type: 'transfer',
        amount: 400,
        status: 'pending',
        accountId: 'acc-livretA',
        destinationAccountId: 'acc-main'
      };

      const transactions = [tx];

      expect(calculateForecastedBalance(accountLivretA, transactions)).toBe(600);
      expect(calculateForecastedBalance(accountMain, transactions)).toBe(3400);
      expect(calculateForecastedBalance(accountLivretA, transactions) + calculateForecastedBalance(accountMain, transactions)).toBe(4000);
    });
  });

  describe('4. Contrôle de non-comptabilisation en revenu ou dépense externe', () => {
    it('un transfert isolé ne modifie jamais le revenu brut', () => {
      const txTransfer: Transaction = {
        id: 'tx-t',
        date: '2026-10-18',
        type: 'transfer',
        amount: 500,
        status: 'cleared',
        accountId: 'acc-main',
        destinationAccountId: 'acc-livretA'
      };

      // getTransactionImpact sur un transfert depuis un compte unique est négatif (sortie d'argent du compte source)
      // mais il n'est jamais de type 'income'
      expect(txTransfer.type).not.toBe('income');
      expect(getTransactionImpact(txTransfer)).toBe(-500);
    });
  });

  describe('5. Matrice complète des transferts internes inter-comptes (statuts pending, cleared, planned, disabled)', () => {
    // Soldes initiaux : Main = 3000 €, Sec = 500 €, LivretA = 1000 €, Lep = 2000 € (Total consolidé = 6500 €)

    it('A. Principal -> Secondaire : en attente (pending) puis validé (cleared)', () => {
      // 1. Avant opération
      expect(calculateRealBalance(accountMain, [])).toBe(3000);
      expect(calculateRealBalance(accountSec, [])).toBe(500);
      expect(calculateForecastedBalance(accountMain, [])).toBe(3000);
      expect(calculateForecastedBalance(accountSec, [])).toBe(500);

      // 2. En attente (pending) de 200 €
      const txPending: Transaction = {
        id: 'tx-p-s-1',
        date: '2026-10-20',
        type: 'transfer',
        amount: 200,
        status: 'pending',
        accountId: 'acc-main',
        destinationAccountId: 'acc-sec'
      };
      // Solde réel : aucun changement car non pointé
      expect(calculateRealBalance(accountMain, [txPending])).toBe(3000);
      expect(calculateRealBalance(accountSec, [txPending])).toBe(500);
      // Solde disponible et prévisionnel : Main sort 200 € (2800 €), Sec reçoit 200 € (700 €)
      expect(calculateForecastedBalance(accountMain, [txPending])).toBe(2800);
      expect(calculateForecastedBalance(accountSec, [txPending])).toBe(700);
      // Total consolidé strictement conservé (2800 + 700 = 3500 €)
      expect(calculateForecastedBalance(accountMain, [txPending]) + calculateForecastedBalance(accountSec, [txPending])).toBe(3500);

      // 3. Effectué / validé (cleared)
      const txCleared: Transaction = { ...txPending, status: 'cleared' };
      // Solde réel : Main = 2800 €, Sec = 700 €
      expect(calculateRealBalance(accountMain, [txCleared])).toBe(2800);
      expect(calculateRealBalance(accountSec, [txCleared])).toBe(700);
      // Solde prévisionnel : Main = 2800 €, Sec = 700 € (aucun double retrait !)
      expect(calculateForecastedBalance(accountMain, [txCleared])).toBe(2800);
      expect(calculateForecastedBalance(accountSec, [txCleared])).toBe(700);
      expect(calculateRealBalance(accountMain, [txCleared]) + calculateRealBalance(accountSec, [txCleared])).toBe(3500);
    });

    it('B. Secondaire -> Épargne (Sec -> Livret A) : en attente puis validé (pas de double déduction)', () => {
      // 1. Avant opération : Sec = 500 €, Livret A = 1000 € (Total = 1500 €)
      expect(calculateRealBalance(accountSec, [])).toBe(500);
      expect(calculateRealBalance(accountLivretA, [])).toBe(1000);

      // 2. En attente (pending) de 150 €
      const txPending: Transaction = {
        id: 'tx-s-e-1',
        date: '2026-10-20',
        type: 'transfer',
        amount: 150,
        status: 'pending',
        accountId: 'acc-sec',
        destinationAccountId: 'acc-livretA'
      };
      // Solde réel : inchangé (500 € et 1000 €)
      expect(calculateRealBalance(accountSec, [txPending])).toBe(500);
      expect(calculateRealBalance(accountLivretA, [txPending])).toBe(1000);
      // Solde prévisionnel : Sec = 350 €, Livret A = 1150 € (Total = 1500 €)
      expect(calculateForecastedBalance(accountSec, [txPending])).toBe(350);
      expect(calculateForecastedBalance(accountLivretA, [txPending])).toBe(1150);

      // 3. Validé (cleared) de 150 €
      const txCleared: Transaction = { ...txPending, status: 'cleared' };
      // Solde réel après validation : Sec = 350 € (déduit UNE SEULE FOIS), Livret A = 1150 €
      expect(calculateRealBalance(accountSec, [txCleared])).toBe(350);
      expect(calculateRealBalance(accountLivretA, [txCleared])).toBe(1150);
      // Solde prévisionnel après validation : Sec = 350 € (aucun second retrait !), Livret A = 1150 €
      expect(calculateForecastedBalance(accountSec, [txCleared])).toBe(350);
      expect(calculateForecastedBalance(accountLivretA, [txCleared])).toBe(1150);
      expect(calculateRealBalance(accountSec, [txCleared]) + calculateRealBalance(accountLivretA, [txCleared])).toBe(1500);
    });

    it('C. Principal -> Épargne (Main -> Livret A) : en attente puis validé', () => {
      const txPending: Transaction = {
        id: 'tx-m-e-1',
        date: '2026-10-20',
        type: 'transfer',
        amount: 500,
        status: 'pending',
        accountId: 'acc-main',
        destinationAccountId: 'acc-livretA'
      };
      expect(calculateForecastedBalance(accountMain, [txPending])).toBe(2500);
      expect(calculateForecastedBalance(accountLivretA, [txPending])).toBe(1500);

      const txCleared: Transaction = { ...txPending, status: 'cleared' };
      expect(calculateRealBalance(accountMain, [txCleared])).toBe(2500);
      expect(calculateRealBalance(accountLivretA, [txCleared])).toBe(1500);
      expect(calculateForecastedBalance(accountMain, [txCleared])).toBe(2500);
      expect(calculateForecastedBalance(accountLivretA, [txCleared])).toBe(1500);
    });

    it('D. Épargne -> Secondaire (Livret A -> Sec) : en attente puis validé', () => {
      const txPending: Transaction = {
        id: 'tx-e-s-1',
        date: '2026-10-20',
        type: 'transfer',
        amount: 100,
        status: 'pending',
        accountId: 'acc-livretA',
        destinationAccountId: 'acc-sec'
      };
      expect(calculateForecastedBalance(accountLivretA, [txPending])).toBe(900);
      expect(calculateForecastedBalance(accountSec, [txPending])).toBe(600);
      expect(calculateForecastedBalance(accountMain, [txPending])).toBe(3000); // Strictement neutre sur Main

      const txCleared: Transaction = { ...txPending, status: 'cleared' };
      expect(calculateRealBalance(accountLivretA, [txCleared])).toBe(900);
      expect(calculateRealBalance(accountSec, [txCleared])).toBe(600);
      expect(calculateRealBalance(accountMain, [txCleared])).toBe(3000);
    });

    it('E. Épargne -> Principal (Livret A -> Main) : en attente puis validé', () => {
      const txPending: Transaction = {
        id: 'tx-e-m-1',
        date: '2026-10-20',
        type: 'transfer',
        amount: 300,
        status: 'pending',
        accountId: 'acc-livretA',
        destinationAccountId: 'acc-main'
      };
      expect(calculateForecastedBalance(accountLivretA, [txPending])).toBe(700);
      expect(calculateForecastedBalance(accountMain, [txPending])).toBe(3300);

      const txCleared: Transaction = { ...txPending, status: 'cleared' };
      expect(calculateRealBalance(accountLivretA, [txCleared])).toBe(700);
      expect(calculateRealBalance(accountMain, [txCleared])).toBe(3300);
    });

    it('F. Épargne -> Épargne (Livret A -> LEP) : en attente puis validé', () => {
      const txPending: Transaction = {
        id: 'tx-e-e-1',
        date: '2026-10-20',
        type: 'transfer',
        amount: 400,
        status: 'pending',
        accountId: 'acc-livretA',
        destinationAccountId: 'acc-lep'
      };
      expect(calculateForecastedBalance(accountLivretA, [txPending])).toBe(600);
      expect(calculateForecastedBalance(accountLep, [txPending])).toBe(2400);

      const txCleared: Transaction = { ...txPending, status: 'cleared' };
      expect(calculateRealBalance(accountLivretA, [txCleared])).toBe(600);
      expect(calculateRealBalance(accountLep, [txCleared])).toBe(2400);
      expect(calculateRealBalance(accountLivretA, [txCleared]) + calculateRealBalance(accountLep, [txCleared])).toBe(3000);
    });

    it('H. Secondaire -> Principal (Sec -> Main) : en attente puis validé', () => {
      // 1. Avant opération : Sec = 500 €, Main = 3000 € (Total = 3500 €)
      expect(calculateRealBalance(accountSec, [])).toBe(500);
      expect(calculateRealBalance(accountMain, [])).toBe(3000);
      expect(calculateForecastedBalance(accountSec, [])).toBe(500);
      expect(calculateForecastedBalance(accountMain, [])).toBe(3000);

      // 2. En attente (pending) de 150 €
      const txPending: Transaction = {
        id: 'tx-s-m-1',
        date: '2026-10-20',
        type: 'transfer',
        amount: 150,
        status: 'pending',
        accountId: 'acc-sec',
        destinationAccountId: 'acc-main'
      };
      // Solde réel : aucun changement car non pointé
      expect(calculateRealBalance(accountSec, [txPending])).toBe(500);
      expect(calculateRealBalance(accountMain, [txPending])).toBe(3000);
      // Solde prévisionnel : Sec = 350 €, Main = 3150 €
      expect(calculateForecastedBalance(accountSec, [txPending])).toBe(350);
      expect(calculateForecastedBalance(accountMain, [txPending])).toBe(3150);
      expect(calculateForecastedBalance(accountSec, [txPending]) + calculateForecastedBalance(accountMain, [txPending])).toBe(3500);

      // 3. Validé (cleared)
      const txCleared: Transaction = { ...txPending, status: 'cleared' };
      // Solde réel pointé : Sec = 350 €, Main = 3150 €
      expect(calculateRealBalance(accountSec, [txCleared])).toBe(350);
      expect(calculateRealBalance(accountMain, [txCleared])).toBe(3150);
      // Solde prévisionnel : Sec = 350 €, Main = 3150 € (aucun double crédit !)
      expect(calculateForecastedBalance(accountSec, [txCleared])).toBe(350);
      expect(calculateForecastedBalance(accountMain, [txCleared])).toBe(3150);
      expect(calculateRealBalance(accountSec, [txCleared]) + calculateRealBalance(accountMain, [txCleared])).toBe(3500);
    });

    it('G. Opérations prévues (planned) et annulées (disabled)', () => {
      const txPlanned: Transaction = {
        id: 'tx-pln-1',
        date: '2026-10-28',
        type: 'transfer',
        amount: 250,
        status: 'planned',
        accountId: 'acc-main',
        destinationAccountId: 'acc-sec'
      };
      // Planned : n'affecte pas le réel ni le disponible, mais affecte le prévisionnel
      expect(calculateRealBalance(accountMain, [txPlanned])).toBe(3000);
      expect(calculateAvailableBalance(accountMain, [txPlanned])).toBe(3000);
      expect(calculateForecastedBalance(accountMain, [txPlanned])).toBe(2750);
      expect(calculateForecastedBalance(accountSec, [txPlanned])).toBe(750);

      const txDisabled: Transaction = { ...txPlanned, status: 'disabled' };
      // Disabled : aucun impact sur aucun calcul
      expect(calculateRealBalance(accountMain, [txDisabled])).toBe(3000);
      expect(calculateAvailableBalance(accountMain, [txDisabled])).toBe(3000);
      expect(calculateForecastedBalance(accountMain, [txDisabled])).toBe(3000);
      expect(calculateForecastedBalance(accountSec, [txDisabled])).toBe(500);
    });
  });
});
