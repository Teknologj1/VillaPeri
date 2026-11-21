import { describe, expect, it } from "vitest";

import {
  domingoDePascoa,
  feriadosNacionais,
  feriadosNoPeriodo,
  periodosEspeciais,
} from "./feriados";

describe("domingoDePascoa", () => {
  it("bate com as datas conhecidas", () => {
    // Conferidas contra calendário litúrgico; são a âncora de Carnaval,
    // Sexta-feira Santa e Corpus Christi.
    expect(domingoDePascoa(2026)).toBe("2026-04-05");
    expect(domingoDePascoa(2027)).toBe("2027-03-28");
    expect(domingoDePascoa(2028)).toBe("2028-04-16");
    expect(domingoDePascoa(2029)).toBe("2029-04-01");
    expect(domingoDePascoa(2030)).toBe("2030-04-21");
  });

  it("acerta também em anos fora da janela usual", () => {
    expect(domingoDePascoa(2025)).toBe("2025-04-20");
    expect(domingoDePascoa(2038)).toBe("2038-04-25"); // a data mais tardia possível
    expect(domingoDePascoa(2035)).toBe("2035-03-25");
  });

  it("cai sempre num domingo", () => {
    for (let ano = 2026; ano <= 2060; ano++) {
      const d = new Date(`${domingoDePascoa(ano)}T00:00:00Z`);
      expect(d.getUTCDay()).toBe(0);
    }
  });
});

describe("feriadosNacionais", () => {
  it("calcula os móveis a partir da Páscoa", () => {
    const f2027 = feriadosNacionais(2027);
    const por = (nome: string) => f2027.find((x) => x.nome === nome)?.data;

    // Páscoa 2027 = 28/03.
    expect(por("Carnaval (terça)")).toBe("2027-02-09");
    expect(por("Sexta-feira Santa")).toBe("2027-03-26");
    expect(por("Corpus Christi")).toBe("2027-05-27");
  });

  it("inclui os fixos", () => {
    const f = feriadosNacionais(2027);
    const datas = f.map((x) => x.data);
    expect(datas).toContain("2027-01-01");
    expect(datas).toContain("2027-09-07");
    expect(datas).toContain("2027-12-25");
    // Feriado nacional desde a Lei 14.759/2023.
    expect(datas).toContain("2027-11-20");
  });

  it("vem ordenado por data", () => {
    const datas = feriadosNacionais(2027).map((x) => x.data);
    expect([...datas].sort()).toEqual(datas);
  });

  it("não inventa feriado municipal", () => {
    // A Festa do Divino de Pirenópolis é o período de maior demanda da cidade,
    // mas a data efetiva não sai de fórmula: o proprietário cadastra.
    const nomes = feriadosNacionais(2027).map((x) => x.nome.toLowerCase());
    expect(nomes.some((n) => n.includes("divino"))).toBe(false);
    expect(feriadosNacionais(2027).every((f) => f.ambito === "nacional")).toBe(true);
  });

  it("Carnaval cai em segunda e terça", () => {
    for (const ano of [2026, 2027, 2028]) {
      const f = feriadosNacionais(ano);
      const segunda = f.find((x) => x.nome === "Carnaval (segunda)")!;
      const terca = f.find((x) => x.nome === "Carnaval (terça)")!;
      expect(new Date(`${segunda.data}T00:00:00Z`).getUTCDay()).toBe(1);
      expect(new Date(`${terca.data}T00:00:00Z`).getUTCDay()).toBe(2);
    }
  });
});

describe("periodosEspeciais", () => {
  it("o Carnaval acompanha a Páscoa e termina na Quarta-feira de Cinzas", () => {
    // Páscoa 2027 = 28/03. Carnaval (terça) = 09/02; o período vai da sexta
    // anterior, 05/02, à quarta de cinzas, 10/02.
    const [, carnaval] = periodosEspeciais(2027);
    expect(carnaval?.inicio).toBe("2027-02-05");
    expect(carnaval?.fim).toBe("2027-02-10");

    const inicio = new Date(`${carnaval!.inicio}T00:00:00Z`);
    const fim = new Date(`${carnaval!.fim}T00:00:00Z`);
    expect(inicio.getUTCDay()).toBe(5); // sexta
    expect(fim.getUTCDay()).toBe(3); // quarta
  });

  it("o Carnaval cai em sexta e quarta em qualquer ano", () => {
    for (let ano = 2026; ano <= 2040; ano++) {
      const [, carnaval] = periodosEspeciais(ano);
      expect(new Date(`${carnaval!.inicio}T00:00:00Z`).getUTCDay()).toBe(5);
      expect(new Date(`${carnaval!.fim}T00:00:00Z`).getUTCDay()).toBe(3);
    }
  });

  it("o réveillon atravessa a virada do ano", () => {
    const [reveillon] = periodosEspeciais(2026);
    expect(reveillon?.inicio).toBe("2026-12-28");
    expect(reveillon?.fim).toBe("2027-01-02");
    expect(reveillon?.nome).toBe("Réveillon 2026/2027");
  });

  it("os dois períodos de um ano não se sobrepõem", () => {
    for (let ano = 2026; ano <= 2035; ano++) {
      const [reveillon, carnaval] = periodosEspeciais(ano);
      // O Carnaval é sempre no começo do ano; o réveillon, no fim.
      expect(carnaval!.fim < reveillon!.inicio).toBe(true);
    }
  });
});

describe("feriadosNoPeriodo", () => {
  it("cobre o intervalo inteiro, sem repetir", () => {
    const f = feriadosNoPeriodo(2026, 2028);
    const anos = new Set(f.map((x) => x.data.slice(0, 4)));
    expect([...anos].sort()).toEqual(["2026", "2027", "2028"]);
    expect(new Set(f.map((x) => `${x.data}|${x.nome}`)).size).toBe(f.length);
  });
});
