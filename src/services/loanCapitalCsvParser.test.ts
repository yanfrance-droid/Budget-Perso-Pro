import { describe, it, expect } from 'vitest';
import { 
  parseLoanCapitalCsv, 
  normalizeMonth, 
  parseFrenchNumber, 
  splitCsvLine,
  detectDelimiter
} from './loanCapitalCsvParser';

describe('loanCapitalCsvParser', () => {
  it('1. Parsing d\'un CSV point-virgule avec décimales françaises et en-têtes français', () => {
    const csvContent = `Mois;Capital Prêt Immo;Mensualité Immo;Capital Crédits Conso;Mensualité Conso;Remarques
2024-01;120 000,50;650,20;15 000,00;350,00;Premier mois
2024-02;119 500,25;650,20;14 700,50;350,00;Deuxième mois`;

    const res = parseLoanCapitalCsv(csvContent);
    expect(res.errors).toHaveLength(0);
    expect(res.records).toHaveLength(2);
    expect(res.delimiter).toBe(';');

    expect(res.records[0]).toEqual({
      month: '2024-01',
      realEstateCapital: 120000.50,
      realEstateMonthlyPayment: 650.20,
      consumerCapital: 15000.00,
      consumerMonthlyPayment: 350.00,
      notes: 'Premier mois'
    });

    expect(res.records[1].realEstateCapital).toBe(119500.25);
    expect(res.records[1].consumerCapital).toBe(14700.50);
  });

  it('2. Parsing d\'un CSV avec le fichier réel loans_history.csv du projet (en-têtes anglais et colonnes vides)', () => {
    const csvContent = `month;mortgageCapital;consumerCapital
2020-01;150000.00;
2020-02;149000.00;
2025-05;105000.00;25000.00`;

    const res = parseLoanCapitalCsv(csvContent);
    expect(res.errors).toHaveLength(0);
    expect(res.records).toHaveLength(3);

    // 2019-07 n'a pas de crédit conso
    expect(res.records[0].month).toBe('2020-01');
    expect(res.records[0].realEstateCapital).toBe(150000.00);
    expect(res.records[0].consumerCapital).toBeNull();

    // 2025-03 a les deux
    expect(res.records[2].month).toBe('2025-05');
    expect(res.records[2].realEstateCapital).toBe(105000.00);
    expect(res.records[2].consumerCapital).toBe(25000.00);
  });

  it('3. Détection et normalisation des dates au format français MM/AAAA', () => {
    const csvContent = `date;crd_immo;crd_conso
01/2024;100000;5000
02/2024;99500;4800`;

    const res = parseLoanCapitalCsv(csvContent);
    expect(res.errors).toHaveLength(0);
    expect(res.records).toHaveLength(2);
    expect(res.records[0].month).toBe('2024-01');
    expect(res.records[1].month).toBe('2024-02');
  });

  it('4. Rejet et signalement d\'erreur si la colonne de mois est absente', () => {
    const csvContent = `capitalImmo;capitalConso
100000;5000`;

    const res = parseLoanCapitalCsv(csvContent);
    expect(res.records).toHaveLength(0);
    expect(res.errors[0]).toContain('Colonne obligatoire de mois introuvable');
  });

  it('5. Rejet et arrêt complet si un mois est mal formaté (aucun import partiel)', () => {
    const csvContent = `month;realEstateCapital
2024-01;100000
invalid-month;99000
2024-03;98000`;

    const res = parseLoanCapitalCsv(csvContent);
    expect(res.records).toHaveLength(0);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]).toContain('Format de mois invalide');
  });

  it('6. Rejet et arrêt complet si un montant est corrompu ou non numérique', () => {
    const csvContent = `month;realEstateCapital;consumerCapital
2024-01;100000;5000
2024-02;texte_invalide;4500`;

    const res = parseLoanCapitalCsv(csvContent);
    expect(res.records).toHaveLength(0);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]).toContain('Valeur invalide pour le capital immobilier');
  });

  it('7. Rejet et arrêt complet en cas de doublon de mois', () => {
    const csvContent = `month;realEstateCapital
2024-01;100000
2024-01;99000`;

    const res = parseLoanCapitalCsv(csvContent);
    expect(res.records).toHaveLength(0);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]).toContain('Doublon détecté pour le mois "2024-01"');
  });

  it('8. Support des fichiers CSV avec délimiteur virgule (,)', () => {
    const csvContent = `month,realEstateCapital,consumerCapital
2024-01,100000.50,5000.25
2024-02,99500.20,4800.10`;

    const res = parseLoanCapitalCsv(csvContent);
    expect(res.errors).toHaveLength(0);
    expect(res.records).toHaveLength(2);
    expect(res.delimiter).toBe(',');
    expect(res.records[0].realEstateCapital).toBe(100000.50);
  });

  it('9. Rejet strict si un CSV à virgules contient des décimales françaises non entourées de guillemets', () => {
    // 3 colonnes dans l'en-tête, mais 5 cellules sur la ligne 2 à cause des virgules décimales non quotées
    const csvContent = `month,realEstateCapital,consumerCapital
2024-01,120372,90,45528,51`;

    const res = parseLoanCapitalCsv(csvContent);
    expect(res.records).toHaveLength(0);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]).toContain('Ligne 2 : Nombre de colonnes incorrect');
    expect(res.errors[0]).toContain('5 trouvée(s), 3 attendue(s)');
  });

  it('10. Acceptation d\'un CSV à virgules contenant des décimales françaises correctement entourées de guillemets', () => {
    const csvContent = `month,realEstateCapital,consumerCapital
2024-01,"120 372,90","45 528,51"
2024-02,"119 500,00","45 000,00"`;

    const res = parseLoanCapitalCsv(csvContent);
    expect(res.errors).toHaveLength(0);
    expect(res.records).toHaveLength(2);
    expect(res.records[0].realEstateCapital).toBe(120372.90);
    expect(res.records[0].consumerCapital).toBe(45528.51);
  });

  it('11. Rejet strict si une ligne contient trop ou trop peu de colonnes', () => {
    const tooFew = `month;realEstateCapital;consumerCapital
2024-01;100000`; // Manque une colonne

    const resTooFew = parseLoanCapitalCsv(tooFew);
    expect(resTooFew.records).toHaveLength(0);
    expect(resTooFew.errors[0]).toContain('Nombre de colonnes incorrect (2 trouvée(s), 3 attendue(s))');

    const tooMany = `month;realEstateCapital;consumerCapital
2024-01;100000;5000;inattendu`; // Colonne en trop

    const resTooMany = parseLoanCapitalCsv(tooMany);
    expect(resTooMany.records).toHaveLength(0);
    expect(resTooMany.errors[0]).toContain('Nombre de colonnes incorrect (4 trouvée(s), 3 attendue(s))');
  });
});
