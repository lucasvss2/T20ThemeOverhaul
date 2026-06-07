/**
 * Dados da tabela de geração de tesouros (Tormenta20).
 *
 * GERADO AUTOMATICAMENTE por scripts/export-treasure.py a partir de
 * "T20 - Tabela de geração de tesouros.xlsx". NÃO EDITAR À MÃO — para
 * atualizar/expandir, edite a planilha e rode o script novamente.
 *
 * Faixas d% são [min, max] inclusivas. Crédito da planilha: Guilherme Dei
 * Svaldi; riquezas adicionais: Rafael Dei Svaldi.
 */

export interface DPRow { range: [number, number]; result: string }
export interface NDEntry { nd: string; dinheiro: DPRow[]; itens: DPRow[] }
export interface ItemRow { range: [number, number]; nome?: string; item?: string; preco?: string; livro?: string; pagina?: string }
export interface RiquezaRow { valor: string; exemplos: string; menor: [number, number] | null; media: [number, number] | null; maior: [number, number] | null }
export interface TreasureData {
    main: NDEntry[];
    itensDiversos: ItemRow[];
    pocoes: ItemRow[];
    equipamentos: Record<string, ItemRow[]>;
    superiores: Record<string, ItemRow[]>;
    magicos: Record<string, ItemRow[]>;
    acessorios: Record<string, ItemRow[]>;
    riquezas: RiquezaRow[];
}

export const TREASURE: TreasureData = {
 "main": [
  {
   "nd": "1/4",
   "dinheiro": [
    {
     "range": [
      1,
      30
     ],
     "result": "—"
    },
    {
     "range": [
      31,
      70
     ],
     "result": "1d6x10 TC"
    },
    {
     "range": [
      71,
      95
     ],
     "result": "1d4x100 TC"
    },
    {
     "range": [
      96,
      100
     ],
     "result": "1d6x10 T$"
    }
   ],
   "itens": [
    {
     "range": [
      1,
      50
     ],
     "result": "—"
    },
    {
     "range": [
      51,
      75
     ],
     "result": "Item diverso"
    },
    {
     "range": [
      76,
      100
     ],
     "result": "Equipamento"
    }
   ]
  },
  {
   "nd": "1/2",
   "dinheiro": [
    {
     "range": [
      1,
      25
     ],
     "result": "—"
    },
    {
     "range": [
      26,
      70
     ],
     "result": "2d6x10 TC"
    },
    {
     "range": [
      71,
      95
     ],
     "result": "2d8x10 T$"
    },
    {
     "range": [
      96,
      100
     ],
     "result": "1d4x100 T$"
    }
   ],
   "itens": [
    {
     "range": [
      1,
      45
     ],
     "result": "—"
    },
    {
     "range": [
      46,
      70
     ],
     "result": "Item diverso"
    },
    {
     "range": [
      71,
      100
     ],
     "result": "Equipamento"
    }
   ]
  },
  {
   "nd": "1",
   "dinheiro": [
    {
     "range": [
      1,
      20
     ],
     "result": "—"
    },
    {
     "range": [
      21,
      70
     ],
     "result": "3d8x10 T$"
    },
    {
     "range": [
      71,
      95
     ],
     "result": "4d12x10 T$"
    },
    {
     "range": [
      96,
      100
     ],
     "result": "1 riqueza menor"
    }
   ],
   "itens": [
    {
     "range": [
      1,
      40
     ],
     "result": "—"
    },
    {
     "range": [
      41,
      65
     ],
     "result": "Item diverso"
    },
    {
     "range": [
      66,
      90
     ],
     "result": "Equipamento"
    },
    {
     "range": [
      91,
      100
     ],
     "result": "1 poção"
    }
   ]
  },
  {
   "nd": "2",
   "dinheiro": [
    {
     "range": [
      1,
      15
     ],
     "result": "—"
    },
    {
     "range": [
      16,
      55
     ],
     "result": "3d10x10 T$"
    },
    {
     "range": [
      56,
      85
     ],
     "result": "2d4x100 T$"
    },
    {
     "range": [
      86,
      95
     ],
     "result": "2d6+1x100 T$"
    },
    {
     "range": [
      96,
      100
     ],
     "result": "1 riqueza menor"
    }
   ],
   "itens": [
    {
     "range": [
      1,
      30
     ],
     "result": "—"
    },
    {
     "range": [
      31,
      40
     ],
     "result": "Item diverso"
    },
    {
     "range": [
      41,
      70
     ],
     "result": "Equipamento"
    },
    {
     "range": [
      71,
      90
     ],
     "result": "1 poção"
    },
    {
     "range": [
      91,
      100
     ],
     "result": "Superior (1 melhoria)"
    }
   ]
  },
  {
   "nd": "3",
   "dinheiro": [
    {
     "range": [
      1,
      10
     ],
     "result": "—"
    },
    {
     "range": [
      11,
      20
     ],
     "result": "4d12x10 T$"
    },
    {
     "range": [
      21,
      60
     ],
     "result": "1d4x100 T$"
    },
    {
     "range": [
      61,
      90
     ],
     "result": "1d8x10 TO"
    },
    {
     "range": [
      91,
      100
     ],
     "result": "1d3 riquezas menores"
    }
   ],
   "itens": [
    {
     "range": [
      1,
      25
     ],
     "result": "—"
    },
    {
     "range": [
      26,
      35
     ],
     "result": "Item diverso"
    },
    {
     "range": [
      36,
      60
     ],
     "result": "Equipamento"
    },
    {
     "range": [
      61,
      85
     ],
     "result": "1 poção"
    },
    {
     "range": [
      86,
      100
     ],
     "result": "Superior (1 melhoria)"
    }
   ]
  },
  {
   "nd": "4",
   "dinheiro": [
    {
     "range": [
      1,
      10
     ],
     "result": "—"
    },
    {
     "range": [
      11,
      50
     ],
     "result": "1d6x100 T$"
    },
    {
     "range": [
      51,
      80
     ],
     "result": "1d12x100 T$"
    },
    {
     "range": [
      81,
      90
     ],
     "result": "1 riqueza menor +%"
    },
    {
     "range": [
      91,
      100
     ],
     "result": "1d3 riquezas menores +%"
    }
   ],
   "itens": [
    {
     "range": [
      1,
      20
     ],
     "result": "—"
    },
    {
     "range": [
      21,
      30
     ],
     "result": "Item diverso"
    },
    {
     "range": [
      31,
      55
     ],
     "result": "Equipamento 2D"
    },
    {
     "range": [
      56,
      80
     ],
     "result": "1 poção +%"
    },
    {
     "range": [
      81,
      100
     ],
     "result": "Superior (1 melhoria) 2D"
    }
   ]
  },
  {
   "nd": "5",
   "dinheiro": [
    {
     "range": [
      1,
      15
     ],
     "result": "—"
    },
    {
     "range": [
      16,
      65
     ],
     "result": "1d8x100 T$"
    },
    {
     "range": [
      66,
      95
     ],
     "result": "3d4x10 TO"
    },
    {
     "range": [
      96,
      100
     ],
     "result": "1 riqueza média"
    }
   ],
   "itens": [
    {
     "range": [
      1,
      20
     ],
     "result": "—"
    },
    {
     "range": [
      21,
      70
     ],
     "result": "1 poção"
    },
    {
     "range": [
      71,
      90
     ],
     "result": "Superior (1 melhoria)"
    },
    {
     "range": [
      91,
      100
     ],
     "result": "Superior (2 melhorias)"
    }
   ]
  },
  {
   "nd": "6",
   "dinheiro": [
    {
     "range": [
      1,
      15
     ],
     "result": "—"
    },
    {
     "range": [
      16,
      60
     ],
     "result": "2d6x100 T$"
    },
    {
     "range": [
      61,
      90
     ],
     "result": "2d10x100 T$"
    },
    {
     "range": [
      91,
      100
     ],
     "result": "1d3+1 riquezas menores"
    }
   ],
   "itens": [
    {
     "range": [
      1,
      20
     ],
     "result": "—"
    },
    {
     "range": [
      21,
      65
     ],
     "result": "1 poção +%"
    },
    {
     "range": [
      66,
      95
     ],
     "result": "Superior (1 melhoria)"
    },
    {
     "range": [
      96,
      100
     ],
     "result": "Superior (2 melhorias) 2D"
    }
   ]
  },
  {
   "nd": "7",
   "dinheiro": [
    {
     "range": [
      1,
      10
     ],
     "result": "—"
    },
    {
     "range": [
      11,
      60
     ],
     "result": "2d8x100 T$"
    },
    {
     "range": [
      61,
      90
     ],
     "result": "2d12x10 TO"
    },
    {
     "range": [
      91,
      100
     ],
     "result": "1d4+1 riquezas menores"
    }
   ],
   "itens": [
    {
     "range": [
      1,
      20
     ],
     "result": "—"
    },
    {
     "range": [
      21,
      60
     ],
     "result": "1d3 poções"
    },
    {
     "range": [
      61,
      90
     ],
     "result": "Superior (2 melhorias)"
    },
    {
     "range": [
      91,
      100
     ],
     "result": "Superior (3 melhorias)"
    }
   ]
  },
  {
   "nd": "8",
   "dinheiro": [
    {
     "range": [
      1,
      10
     ],
     "result": "—"
    },
    {
     "range": [
      11,
      55
     ],
     "result": "2d10x100 T$"
    },
    {
     "range": [
      56,
      95
     ],
     "result": "1d4+1 riquezas menores"
    },
    {
     "range": [
      96,
      100
     ],
     "result": "1 riqueza média+%"
    }
   ],
   "itens": [
    {
     "range": [
      1,
      20
     ],
     "result": "—"
    },
    {
     "range": [
      21,
      75
     ],
     "result": "1d3 poções"
    },
    {
     "range": [
      76,
      95
     ],
     "result": "Superior (2 melhorias)"
    },
    {
     "range": [
      96,
      100
     ],
     "result": "Superior (3 melhorias) 2D"
    }
   ]
  },
  {
   "nd": "9",
   "dinheiro": [
    {
     "range": [
      1,
      10
     ],
     "result": "—"
    },
    {
     "range": [
      11,
      35
     ],
     "result": "1 riqueza média"
    },
    {
     "range": [
      36,
      85
     ],
     "result": "4d6x100 T$"
    },
    {
     "range": [
      86,
      100
     ],
     "result": "1d3 riquezas médias"
    }
   ],
   "itens": [
    {
     "range": [
      1,
      20
     ],
     "result": "—"
    },
    {
     "range": [
      21,
      70
     ],
     "result": "1 poção +%"
    },
    {
     "range": [
      71,
      95
     ],
     "result": "Superior (3 melhorias)"
    },
    {
     "range": [
      96,
      100
     ],
     "result": "Mágico (menor)"
    }
   ]
  },
  {
   "nd": "10",
   "dinheiro": [
    {
     "range": [
      1,
      10
     ],
     "result": "—"
    },
    {
     "range": [
      11,
      30
     ],
     "result": "4d6x100 T$"
    },
    {
     "range": [
      31,
      85
     ],
     "result": "4d10x10 TO"
    },
    {
     "range": [
      86,
      100
     ],
     "result": "1d3+1 riquezas médias"
    }
   ],
   "itens": [
    {
     "range": [
      1,
      50
     ],
     "result": "—"
    },
    {
     "range": [
      51,
      75
     ],
     "result": "1d3+1 poções"
    },
    {
     "range": [
      76,
      90
     ],
     "result": "Superior (3 melhorias)"
    },
    {
     "range": [
      91,
      100
     ],
     "result": "Mágico (menor)"
    }
   ]
  },
  {
   "nd": "11",
   "dinheiro": [
    {
     "range": [
      1,
      10
     ],
     "result": "—"
    },
    {
     "range": [
      11,
      45
     ],
     "result": "2d4x1.000 T$"
    },
    {
     "range": [
      46,
      85
     ],
     "result": "1d3 riquezas médias"
    },
    {
     "range": [
      86,
      100
     ],
     "result": "2d6x100 TO"
    }
   ],
   "itens": [
    {
     "range": [
      1,
      45
     ],
     "result": "—"
    },
    {
     "range": [
      46,
      70
     ],
     "result": "1d4+1 poções"
    },
    {
     "range": [
      71,
      90
     ],
     "result": "Superior (3 melhorias)"
    },
    {
     "range": [
      91,
      100
     ],
     "result": "Mágico (menor) 2D"
    }
   ]
  },
  {
   "nd": "12",
   "dinheiro": [
    {
     "range": [
      1,
      10
     ],
     "result": "—"
    },
    {
     "range": [
      11,
      45
     ],
     "result": "1 riqueza média +%"
    },
    {
     "range": [
      46,
      80
     ],
     "result": "2d6x1.000 T$"
    },
    {
     "range": [
      81,
      100
     ],
     "result": "1d4+1 riquezas médias"
    }
   ],
   "itens": [
    {
     "range": [
      1,
      45
     ],
     "result": "—"
    },
    {
     "range": [
      46,
      70
     ],
     "result": "1d3+1 poções +%"
    },
    {
     "range": [
      71,
      85
     ],
     "result": "Superior (4 melhorias)"
    },
    {
     "range": [
      86,
      100
     ],
     "result": "Mágico (menor)"
    }
   ]
  },
  {
   "nd": "13",
   "dinheiro": [
    {
     "range": [
      1,
      10
     ],
     "result": "—"
    },
    {
     "range": [
      11,
      45
     ],
     "result": "4d4x1.000 T$"
    },
    {
     "range": [
      46,
      80
     ],
     "result": "1d3+1 riquezas médias"
    },
    {
     "range": [
      81,
      100
     ],
     "result": "4d6x100 TO"
    }
   ],
   "itens": [
    {
     "range": [
      1,
      40
     ],
     "result": "—"
    },
    {
     "range": [
      41,
      65
     ],
     "result": "1d4+1 poções +%"
    },
    {
     "range": [
      66,
      95
     ],
     "result": "Superior (4 melhorias)"
    },
    {
     "range": [
      96,
      100
     ],
     "result": "Mágico (médio)"
    }
   ]
  },
  {
   "nd": "14",
   "dinheiro": [
    {
     "range": [
      1,
      10
     ],
     "result": "—"
    },
    {
     "range": [
      11,
      45
     ],
     "result": "1d3+1 riquezas médias"
    },
    {
     "range": [
      46,
      80
     ],
     "result": "3d6x1.000 T$"
    },
    {
     "range": [
      81,
      100
     ],
     "result": "1 riqueza maior"
    }
   ],
   "itens": [
    {
     "range": [
      1,
      40
     ],
     "result": "—"
    },
    {
     "range": [
      41,
      65
     ],
     "result": "1d4+1 poções +%"
    },
    {
     "range": [
      66,
      90
     ],
     "result": "Superior (4 melhorias)"
    },
    {
     "range": [
      91,
      100
     ],
     "result": "Mágico (médio)"
    }
   ]
  },
  {
   "nd": "15",
   "dinheiro": [
    {
     "range": [
      1,
      10
     ],
     "result": "—"
    },
    {
     "range": [
      11,
      45
     ],
     "result": "1 riqueza média+%"
    },
    {
     "range": [
      46,
      80
     ],
     "result": "2d10x1.000 T$"
    },
    {
     "range": [
      81,
      100
     ],
     "result": "1d4x1.000 TO"
    }
   ],
   "itens": [
    {
     "range": [
      1,
      35
     ],
     "result": "—"
    },
    {
     "range": [
      36,
      45
     ],
     "result": "1d6+1 poções"
    },
    {
     "range": [
      46,
      85
     ],
     "result": "Superior (4 melhorias) 2D"
    },
    {
     "range": [
      86,
      100
     ],
     "result": "Mágico (médio)"
    }
   ]
  },
  {
   "nd": "16",
   "dinheiro": [
    {
     "range": [
      1,
      10
     ],
     "result": "—"
    },
    {
     "range": [
      11,
      40
     ],
     "result": "3d6x1.000 T$"
    },
    {
     "range": [
      41,
      75
     ],
     "result": "3d10x100 TO"
    },
    {
     "range": [
      76,
      100
     ],
     "result": "1d3 riquezas maiores"
    }
   ],
   "itens": [
    {
     "range": [
      1,
      35
     ],
     "result": "—"
    },
    {
     "range": [
      36,
      45
     ],
     "result": "1d6+1 poções +%"
    },
    {
     "range": [
      46,
      80
     ],
     "result": "Superior (4 melhorias) 2D"
    },
    {
     "range": [
      81,
      100
     ],
     "result": "Mágico (médio)"
    }
   ]
  },
  {
   "nd": "17",
   "dinheiro": [
    {
     "range": [
      1,
      5
     ],
     "result": "—"
    },
    {
     "range": [
      6,
      40
     ],
     "result": "4d6x1.000 T$"
    },
    {
     "range": [
      41,
      75
     ],
     "result": "1d3 riquezas médias +%"
    },
    {
     "range": [
      76,
      100
     ],
     "result": "2d4x1.000 TO"
    }
   ],
   "itens": [
    {
     "range": [
      1,
      20
     ],
     "result": "—"
    },
    {
     "range": [
      21,
      40
     ],
     "result": "Mágico (menor)"
    },
    {
     "range": [
      41,
      80
     ],
     "result": "Mágico (médio)"
    },
    {
     "range": [
      81,
      100
     ],
     "result": "Mágico (maior)"
    }
   ]
  },
  {
   "nd": "18",
   "dinheiro": [
    {
     "range": [
      1,
      5
     ],
     "result": "—"
    },
    {
     "range": [
      6,
      40
     ],
     "result": "4d10x1.000 T$"
    },
    {
     "range": [
      41,
      75
     ],
     "result": "1 riqueza maior"
    },
    {
     "range": [
      76,
      100
     ],
     "result": "1d3+1 riquezas maiores"
    }
   ],
   "itens": [
    {
     "range": [
      1,
      15
     ],
     "result": "—"
    },
    {
     "range": [
      16,
      40
     ],
     "result": "Mágico (menor) 2D"
    },
    {
     "range": [
      41,
      70
     ],
     "result": "Mágico (médio)"
    },
    {
     "range": [
      71,
      100
     ],
     "result": "Mágico (maior)"
    }
   ]
  },
  {
   "nd": "19",
   "dinheiro": [
    {
     "range": [
      1,
      5
     ],
     "result": "—"
    },
    {
     "range": [
      6,
      40
     ],
     "result": "4d12x1.000 T$"
    },
    {
     "range": [
      41,
      75
     ],
     "result": "1 riqueza maior +%"
    },
    {
     "range": [
      76,
      100
     ],
     "result": "1d12x1.000 TO"
    }
   ],
   "itens": [
    {
     "range": [
      1,
      10
     ],
     "result": "—"
    },
    {
     "range": [
      11,
      40
     ],
     "result": "Mágico (menor) 2D"
    },
    {
     "range": [
      41,
      60
     ],
     "result": "Mágico (médio) 2D"
    },
    {
     "range": [
      61,
      100
     ],
     "result": "Mágico (maior)"
    }
   ]
  },
  {
   "nd": "20",
   "dinheiro": [
    {
     "range": [
      1,
      5
     ],
     "result": "—"
    },
    {
     "range": [
      6,
      40
     ],
     "result": "2d4x1.000 TO"
    },
    {
     "range": [
      41,
      75
     ],
     "result": "1d3 riquezas maiores"
    },
    {
     "range": [
      76,
      100
     ],
     "result": "1d3+1 riquezas maiores +%"
    }
   ],
   "itens": [
    {
     "range": [
      1,
      5
     ],
     "result": "—"
    },
    {
     "range": [
      6,
      40
     ],
     "result": "Mágico (menor) 2D"
    },
    {
     "range": [
      41,
      50
     ],
     "result": "Mágico (médio) 2D"
    },
    {
     "range": [
      51,
      100
     ],
     "result": "Mágico (maior) 2D"
    }
   ]
  }
 ],
 "itensDiversos": [
  {
   "range": [
    1,
    1
   ],
   "item": "Ácido",
   "livro": "Tormenta20",
   "pagina": "160"
  },
  {
   "range": [
    2,
    2
   ],
   "item": "Água benta",
   "livro": "Tormenta20",
   "pagina": "155"
  },
  {
   "range": [
    3,
    3
   ],
   "item": "Alaúde élfico",
   "livro": "Tormenta20",
   "pagina": "158"
  },
  {
   "range": [
    4,
    4
   ],
   "item": "Algemas",
   "livro": "Tormenta20",
   "pagina": "155"
  },
  {
   "range": [
    5,
    5
   ],
   "item": "Baga-de-fogo",
   "livro": "Tormenta20",
   "pagina": "160"
  },
  {
   "range": [
    6,
    8
   ],
   "item": "Bálsamo restaurador",
   "livro": "Tormenta20",
   "pagina": "160"
  },
  {
   "range": [
    9,
    9
   ],
   "item": "Bandana",
   "livro": "Tormenta20",
   "pagina": "159"
  },
  {
   "range": [
    10,
    10
   ],
   "item": "Bandoleira de poções",
   "livro": "Tormenta20",
   "pagina": "155"
  },
  {
   "range": [
    11,
    11
   ],
   "item": "Bomba",
   "livro": "Tormenta20",
   "pagina": "160"
  },
  {
   "range": [
    12,
    12
   ],
   "item": "Botas reforçadas",
   "livro": "Tormenta20",
   "pagina": "159"
  },
  {
   "range": [
    13,
    13
   ],
   "item": "Camisa bufante",
   "livro": "Tormenta20",
   "pagina": "159"
  },
  {
   "range": [
    14,
    14
   ],
   "item": "Capa esvoaçante",
   "livro": "Tormenta20",
   "pagina": "159"
  },
  {
   "range": [
    15,
    15
   ],
   "item": "Capa pesada",
   "livro": "Tormenta20",
   "pagina": "159"
  },
  {
   "range": [
    16,
    16
   ],
   "item": "Casaco longo",
   "livro": "Tormenta20",
   "pagina": "159"
  },
  {
   "range": [
    17,
    17
   ],
   "item": "Chapéu arcano",
   "livro": "Tormenta20",
   "pagina": "159"
  },
  {
   "range": [
    18,
    18
   ],
   "item": "Coleção de livros",
   "livro": "Tormenta20",
   "pagina": "158"
  },
  {
   "range": [
    19,
    19
   ],
   "item": "Cosmético",
   "livro": "Tormenta20",
   "pagina": "160"
  },
  {
   "range": [
    20,
    20
   ],
   "item": "Dente-de-dragão",
   "livro": "Tormenta20",
   "pagina": "161"
  },
  {
   "range": [
    21,
    21
   ],
   "item": "Enfeite de elmo",
   "livro": "Tormenta20",
   "pagina": "159"
  },
  {
   "range": [
    22,
    22
   ],
   "item": "Elixir do amor",
   "livro": "Tormenta20",
   "pagina": "160"
  },
  {
   "range": [
    23,
    23
   ],
   "item": "Equipamento de viagem",
   "livro": "Tormenta20",
   "pagina": "155"
  },
  {
   "range": [
    24,
    26
   ],
   "item": "Essência de mana",
   "livro": "Tormenta20",
   "pagina": "160"
  },
  {
   "range": [
    27,
    27
   ],
   "item": "Estojo de disfarces",
   "livro": "Tormenta20",
   "pagina": "158"
  },
  {
   "range": [
    28,
    28
   ],
   "item": "Farrapos de ermitão",
   "livro": "Tormenta20",
   "pagina": "159"
  },
  {
   "range": [
    29,
    29
   ],
   "item": "Flauta mística",
   "livro": "Tormenta20",
   "pagina": "158"
  },
  {
   "range": [
    30,
    30
   ],
   "item": "Fogo alquímico",
   "livro": "Tormenta20",
   "pagina": "160"
  },
  {
   "range": [
    31,
    31
   ],
   "item": "Gorro de ervas",
   "livro": "Tormenta20",
   "pagina": "159"
  },
  {
   "range": [
    32,
    32
   ],
   "item": "Líquen lilás",
   "livro": "Tormenta20",
   "pagina": "161"
  },
  {
   "range": [
    33,
    33
   ],
   "item": "Luneta",
   "livro": "Tormenta20",
   "pagina": "158"
  },
  {
   "range": [
    34,
    34
   ],
   "item": "Luva de pelica",
   "livro": "Tormenta20",
   "pagina": "159"
  },
  {
   "range": [
    35,
    35
   ],
   "item": "Maleta de medicamentos",
   "livro": "Tormenta20",
   "pagina": "158"
  },
  {
   "range": [
    36,
    36
   ],
   "item": "Manopla",
   "livro": "Tormenta20",
   "pagina": "159"
  },
  {
   "range": [
    37,
    37
   ],
   "item": "Manto eclesiástico",
   "livro": "Tormenta20",
   "pagina": "159"
  },
  {
   "range": [
    38,
    38
   ],
   "item": "Mochila de aventureiro",
   "livro": "Tormenta20",
   "pagina": "155"
  },
  {
   "range": [
    39,
    39
   ],
   "item": "Musgo púrpura",
   "livro": "Tormenta20",
   "pagina": "161"
  },
  {
   "range": [
    40,
    40
   ],
   "item": "Organizador de pergaminhos",
   "livro": "Tormenta20",
   "pagina": "155"
  },
  {
   "range": [
    41,
    41
   ],
   "item": "Ossos de monstro",
   "livro": "Tormenta20",
   "pagina": "161"
  },
  {
   "range": [
    42,
    42
   ],
   "item": "Pó de cristal",
   "livro": "Tormenta20",
   "pagina": "161"
  },
  {
   "range": [
    43,
    43
   ],
   "item": "Pó de giz",
   "livro": "Tormenta20",
   "pagina": "161"
  },
  {
   "range": [
    44,
    44
   ],
   "item": "Pó do desaparecimento",
   "livro": "Tormenta20",
   "pagina": "160"
  },
  {
   "range": [
    45,
    45
   ],
   "item": "Robe místico",
   "livro": "Tormenta20",
   "pagina": "159"
  },
  {
   "range": [
    46,
    46
   ],
   "item": "Saco de sal",
   "livro": "Tormenta20",
   "pagina": "161"
  },
  {
   "range": [
    47,
    47
   ],
   "item": "Sapatos de camurça",
   "livro": "Tormenta20",
   "pagina": "159"
  },
  {
   "range": [
    48,
    48
   ],
   "item": "Seixo de âmbar",
   "livro": "Tormenta20",
   "pagina": "161"
  },
  {
   "range": [
    49,
    49
   ],
   "item": "Sela",
   "livro": "Tormenta20",
   "pagina": "158"
  },
  {
   "range": [
    50,
    50
   ],
   "item": "Tabardo",
   "livro": "Tormenta20",
   "pagina": "159"
  },
  {
   "range": [
    51,
    51
   ],
   "item": "Traje da corte",
   "livro": "Tormenta20",
   "pagina": "159"
  },
  {
   "range": [
    52,
    52
   ],
   "item": "Terra de cemitério",
   "livro": "Tormenta20",
   "pagina": "161"
  },
  {
   "range": [
    53,
    53
   ],
   "item": "Veste de seda",
   "livro": "Tormenta20",
   "pagina": "159"
  },
  {
   "range": [
    54,
    54
   ],
   "item": "Corda de teia",
   "livro": "Ameaças de Arton",
   "pagina": "396"
  },
  {
   "range": [
    55,
    55
   ],
   "item": "Dente de wisphago",
   "livro": "Ameaças de Arton",
   "pagina": "396"
  },
  {
   "range": [
    56,
    56
   ],
   "item": "Bomba de fumaça",
   "livro": "Ameaças de Arton",
   "pagina": "396"
  },
  {
   "range": [
    57,
    57
   ],
   "item": "Elixir quimérico",
   "livro": "Ameaças de Arton",
   "pagina": "396"
  },
  {
   "range": [
    58,
    58
   ],
   "item": "Éter elemental",
   "livro": "Ameaças de Arton",
   "pagina": "396"
  },
  {
   "range": [
    59,
    59
   ],
   "item": "Óleo de besouro",
   "livro": "Ameaças de Arton",
   "pagina": "397"
  },
  {
   "range": [
    60,
    60
   ],
   "item": "Água benta concentrada",
   "livro": "Deuses de Arton",
   "pagina": "48"
  },
  {
   "range": [
    61,
    61
   ],
   "item": "Aspersório",
   "livro": "Deuses de Arton",
   "pagina": "48"
  },
  {
   "range": [
    62,
    62
   ],
   "item": "Patuá",
   "livro": "Deuses de Arton",
   "pagina": "49"
  },
  {
   "range": [
    63,
    63
   ],
   "item": "Panfleto de aforismos",
   "livro": "Deuses de Arton",
   "pagina": "49"
  },
  {
   "range": [
    64,
    64
   ],
   "item": "Texto sagrado",
   "livro": "Deuses de Arton",
   "pagina": "49"
  },
  {
   "range": [
    65,
    65
   ],
   "item": "Hábito sacerdotal",
   "livro": "Deuses de Arton",
   "pagina": "49"
  },
  {
   "range": [
    66,
    66
   ],
   "item": "Manto de alto sacerdote",
   "livro": "Deuses de Arton",
   "pagina": "49"
  },
  {
   "range": [
    67,
    67
   ],
   "item": "Sandálias",
   "livro": "Deuses de Arton",
   "pagina": "51"
  },
  {
   "range": [
    68,
    68
   ],
   "item": "Piercing de umbigo",
   "livro": "Deuses de Arton",
   "pagina": "51"
  },
  {
   "range": [
    69,
    69
   ],
   "item": "Incenso",
   "livro": "Deuses de Arton",
   "pagina": "52"
  },
  {
   "range": [
    70,
    70
   ],
   "item": "Santa granada de mão",
   "livro": "Deuses de Arton",
   "pagina": "52"
  },
  {
   "range": [
    71,
    71
   ],
   "item": "Fitilho consagrado",
   "livro": "Deuses de Arton",
   "pagina": "52"
  },
  {
   "range": [
    72,
    72
   ],
   "item": "Pena de anjo",
   "livro": "Deuses de Arton",
   "pagina": "52"
  },
  {
   "range": [
    73,
    73
   ],
   "item": "Ábaco",
   "livro": "Heróis de Arton",
   "pagina": "227"
  },
  {
   "range": [
    74,
    74
   ],
   "item": "Ampulheta",
   "livro": "Heróis de Arton",
   "pagina": "227"
  },
  {
   "range": [
    75,
    75
   ],
   "item": "Astrolábio",
   "livro": "Heróis de Arton",
   "pagina": "227"
  },
  {
   "range": [
    76,
    76
   ],
   "item": "Bainha adornada",
   "livro": "Heróis de Arton",
   "pagina": "227"
  },
  {
   "range": [
    77,
    77
   ],
   "item": "Bússola",
   "livro": "Heróis de Arton",
   "pagina": "227"
  },
  {
   "range": [
    78,
    78
   ],
   "item": "Diagrama anatômico",
   "livro": "Heróis de Arton",
   "pagina": "230"
  },
  {
   "range": [
    79,
    79
   ],
   "item": "Estrepes",
   "livro": "Heróis de Arton",
   "pagina": "230"
  },
  {
   "range": [
    80,
    80
   ],
   "item": "Lampião de foco",
   "livro": "Heróis de Arton",
   "pagina": "230"
  },
  {
   "range": [
    81,
    81
   ],
   "item": "Leque",
   "livro": "Heróis de Arton",
   "pagina": "230"
  },
  {
   "range": [
    82,
    82
   ],
   "item": "Lupa",
   "livro": "Heróis de Arton",
   "pagina": "230"
  },
  {
   "range": [
    83,
    83
   ],
   "item": "Mapa (mestre define de qual região)",
   "livro": "Heróis de Arton",
   "pagina": "230"
  },
  {
   "range": [
    84,
    84
   ],
   "item": "Mecanismo de mola",
   "livro": "Heróis de Arton",
   "pagina": "230"
  },
  {
   "range": [
    85,
    85
   ],
   "item": "Mochila discreta",
   "livro": "Heróis de Arton",
   "pagina": "230"
  },
  {
   "range": [
    86,
    86
   ],
   "item": "Sinete",
   "livro": "Heróis de Arton",
   "pagina": "231"
  },
  {
   "range": [
    87,
    87
   ],
   "item": "Apito de caça",
   "livro": "Heróis de Arton",
   "pagina": "231"
  },
  {
   "range": [
    88,
    88
   ],
   "item": "Baralho marcado",
   "livro": "Heróis de Arton",
   "pagina": "231"
  },
  {
   "range": [
    89,
    89
   ],
   "item": "Clarim deheoni",
   "livro": "Heróis de Arton",
   "pagina": "231"
  },
  {
   "range": [
    90,
    90
   ],
   "item": "Pandeiro das estradas",
   "livro": "Heróis de Arton",
   "pagina": "231"
  },
  {
   "range": [
    91,
    91
   ],
   "item": "Camisolão",
   "livro": "Heróis de Arton",
   "pagina": "232"
  },
  {
   "range": [
    92,
    92
   ],
   "item": "Casaca de apetrechos",
   "livro": "Heróis de Arton",
   "pagina": "232"
  },
  {
   "range": [
    93,
    93
   ],
   "item": "Chapéu emplumado",
   "livro": "Heróis de Arton",
   "pagina": "232"
  },
  {
   "range": [
    94,
    94
   ],
   "item": "Elmo leve",
   "livro": "Heróis de Arton",
   "pagina": "232"
  },
  {
   "range": [
    95,
    95
   ],
   "item": "Elmo pesado",
   "livro": "Heróis de Arton",
   "pagina": "232"
  },
  {
   "range": [
    96,
    96
   ],
   "item": "Rondel",
   "livro": "Heróis de Arton",
   "pagina": "233"
  },
  {
   "range": [
    97,
    97
   ],
   "item": "Sapatos confortáveis",
   "livro": "Heróis de Arton",
   "pagina": "233"
  },
  {
   "range": [
    98,
    98
   ],
   "item": "Sapatos de salto alto",
   "livro": "Heróis de Arton",
   "pagina": "233"
  },
  {
   "range": [
    99,
    99
   ],
   "item": "Ácido concentrado",
   "livro": "Heróis de Arton",
   "pagina": "234"
  },
  {
   "range": [
    100,
    100
   ],
   "item": "Frasco abissal",
   "livro": "Heróis de Arton",
   "pagina": "234"
  }
 ],
 "pocoes": [
  {
   "range": [
    1,
    1
   ],
   "nome": "Abençoar Alimentos (óleo)",
   "preco": "30",
   "livro": "Tormenta20",
   "pagina": "178"
  },
  {
   "range": [
    2,
    2
   ],
   "nome": "Área Escorregadia (granada)",
   "preco": "30",
   "livro": "Tormenta20",
   "pagina": "180"
  },
  {
   "range": [
    3,
    4
   ],
   "nome": "Arma Mágica (óleo)",
   "preco": "30",
   "livro": "Tormenta20",
   "pagina": "181"
  },
  {
   "range": [
    5,
    5
   ],
   "nome": "Compreensão",
   "preco": "30",
   "livro": "Tormenta20",
   "pagina": "184"
  },
  {
   "range": [
    6,
    11
   ],
   "nome": "Curar Ferimentos (2d8+2 PV)",
   "preco": "30",
   "livro": "Tormenta20",
   "pagina": "189"
  },
  {
   "range": [
    12,
    13
   ],
   "nome": "Disfarce Ilusório",
   "preco": "30",
   "livro": "Tormenta20",
   "pagina": "191"
  },
  {
   "range": [
    14,
    15
   ],
   "nome": "Escuridão (óleo)",
   "preco": "30",
   "livro": "Tormenta20",
   "pagina": "193"
  },
  {
   "range": [
    16,
    17
   ],
   "nome": "Luz (óleo)",
   "preco": "30",
   "livro": "Tormenta20",
   "pagina": "197"
  },
  {
   "range": [
    18,
    18
   ],
   "nome": "Névoa (granada)",
   "preco": "30",
   "livro": "Tormenta20",
   "pagina": "200"
  },
  {
   "range": [
    19,
    19
   ],
   "nome": "Primor Atlético",
   "preco": "30",
   "livro": "Tormenta20",
   "pagina": "201"
  },
  {
   "range": [
    20,
    20
   ],
   "nome": "Sono",
   "preco": "30",
   "livro": "Tormenta20",
   "pagina": "207"
  },
  {
   "range": [
    21,
    22
   ],
   "nome": "Proteção Divina",
   "preco": "30",
   "livro": "Tormenta20",
   "pagina": "202"
  },
  {
   "range": [
    23,
    24
   ],
   "nome": "Resistência a Energia",
   "preco": "30",
   "livro": "Tormenta20",
   "pagina": "204"
  },
  {
   "range": [
    25,
    25
   ],
   "nome": "Suporte Ambiental",
   "preco": "30",
   "livro": "Tormenta20",
   "pagina": "207"
  },
  {
   "range": [
    26,
    26
   ],
   "nome": "Tranca Arcana (óleo)",
   "preco": "30",
   "livro": "Tormenta20",
   "pagina": "209"
  },
  {
   "range": [
    27,
    27
   ],
   "nome": "Visão Mística",
   "preco": "30",
   "livro": "Tormenta20",
   "pagina": "211"
  },
  {
   "range": [
    28,
    28
   ],
   "nome": "Vitalidade Fantasma",
   "preco": "30",
   "livro": "Tormenta20",
   "pagina": "211"
  },
  {
   "range": [
    29,
    29
   ],
   "nome": "Armadura Elemental",
   "preco": "30",
   "livro": "Heróis de Arton",
   "pagina": "252"
  },
  {
   "range": [
    30,
    30
   ],
   "nome": "Desafio Corajoso",
   "preco": "30",
   "livro": "Heróis de Arton",
   "pagina": "252"
  },
  {
   "range": [
    31,
    31
   ],
   "nome": "Discrição",
   "preco": "30",
   "livro": "Heróis de Arton",
   "pagina": "253"
  },
  {
   "range": [
    32,
    32
   ],
   "nome": "Farejar Fortuna",
   "preco": "30",
   "livro": "Heróis de Arton",
   "pagina": "254"
  },
  {
   "range": [
    33,
    33
   ],
   "nome": "Maaais Klunc",
   "preco": "30",
   "livro": "Heróis de Arton",
   "pagina": "254"
  },
  {
   "range": [
    34,
    34
   ],
   "nome": "Ossos de Adamante",
   "preco": "30",
   "livro": "Heróis de Arton",
   "pagina": "254"
  },
  {
   "range": [
    35,
    35
   ],
   "nome": "Punho de Mitral",
   "preco": "30",
   "livro": "Heróis de Arton",
   "pagina": "254"
  },
  {
   "range": [
    36,
    36
   ],
   "nome": "Magia Dadivosa",
   "preco": "30",
   "livro": "Deuses de Arton",
   "pagina": "62"
  },
  {
   "range": [
    37,
    37
   ],
   "nome": "Sigilo de Sszzaas",
   "preco": "30",
   "livro": "Deuses de Arton",
   "pagina": "64"
  },
  {
   "range": [
    38,
    38
   ],
   "nome": "Sorriso da Fortuna",
   "preco": "30",
   "livro": "Deuses de Arton",
   "pagina": "64"
  },
  {
   "range": [
    39,
    39
   ],
   "nome": "Toque de Megalokk",
   "preco": "30",
   "livro": "Deuses de Arton",
   "pagina": "65"
  },
  {
   "range": [
    40,
    40
   ],
   "nome": "Voz da Razão",
   "preco": "30",
   "livro": "Deuses de Arton",
   "pagina": "65"
  },
  {
   "range": [
    41,
    42
   ],
   "nome": "Escudo da Fé (aprimoramento para duração cena)",
   "preco": "120",
   "livro": "Tormenta20",
   "pagina": "192"
  },
  {
   "range": [
    43,
    44
   ],
   "nome": "Alterar Tamanho",
   "preco": "270",
   "livro": "Tormenta20",
   "pagina": "179"
  },
  {
   "range": [
    45,
    45
   ],
   "nome": "Aparência Perfeita",
   "preco": "270",
   "livro": "Tormenta20",
   "pagina": "180"
  },
  {
   "range": [
    46,
    46
   ],
   "nome": "Armamento da Natureza (óleo)",
   "preco": "270",
   "livro": "Tormenta20",
   "pagina": "181"
  },
  {
   "range": [
    47,
    50
   ],
   "nome": "Bola de Fogo (granada)",
   "preco": "270",
   "livro": "Tormenta20",
   "pagina": "182"
  },
  {
   "range": [
    51,
    51
   ],
   "nome": "Camuflagem Ilusória",
   "preco": "270",
   "livro": "Tormenta20",
   "pagina": "183"
  },
  {
   "range": [
    52,
    52
   ],
   "nome": "Concentração de Combate (aprimoramento para duração cena)",
   "preco": "270",
   "livro": "Tormenta20",
   "pagina": "185"
  },
  {
   "range": [
    53,
    56
   ],
   "nome": "Curar Ferimentos (4d8+4 PV)",
   "preco": "270",
   "livro": "Tormenta20",
   "pagina": "189"
  },
  {
   "range": [
    57,
    58
   ],
   "nome": "Físico Divino",
   "preco": "270",
   "livro": "Tormenta20",
   "pagina": "193"
  },
  {
   "range": [
    59,
    59
   ],
   "nome": "Mente Divina",
   "preco": "270",
   "livro": "Tormenta20",
   "pagina": "198"
  },
  {
   "range": [
    60,
    60
   ],
   "nome": "Metamorfose",
   "preco": "270",
   "livro": "Tormenta20",
   "pagina": "198"
  },
  {
   "range": [
    61,
    64
   ],
   "nome": "Purificação",
   "preco": "270",
   "livro": "Tormenta20",
   "pagina": "202"
  },
  {
   "range": [
    65,
    66
   ],
   "nome": "Velocidade",
   "preco": "270",
   "livro": "Tormenta20",
   "pagina": "210"
  },
  {
   "range": [
    67,
    68
   ],
   "nome": "Vestimenta da Fé (óleo)",
   "preco": "270",
   "livro": "Tormenta20",
   "pagina": "210"
  },
  {
   "range": [
    69,
    69
   ],
   "nome": "Voz Divina",
   "preco": "270",
   "livro": "Tormenta20",
   "pagina": "211"
  },
  {
   "range": [
    70,
    71
   ],
   "nome": "Orientação (aprimoramento para duração cena; role o atributo afetado, sendo 1 = Força, 2 = Destreza e assim por diante)",
   "preco": "270",
   "livro": "Tormenta20",
   "pagina": "200"
  },
  {
   "range": [
    72,
    72
   ],
   "nome": "Aura de Morte",
   "preco": "270",
   "livro": "Heróis de Arton",
   "pagina": "252"
  },
  {
   "range": [
    73,
    73
   ],
   "nome": "Emular Magia",
   "preco": "270",
   "livro": "Heróis de Arton",
   "pagina": "253"
  },
  {
   "range": [
    74,
    74
   ],
   "nome": "Punho de Mitral (aprimoramento para +2 em testes de ataque e margem de ameaça)",
   "preco": "270",
   "livro": "Heróis de Arton",
   "pagina": "255"
  },
  {
   "range": [
    75,
    75
   ],
   "nome": "Viagem Onírica",
   "preco": "270",
   "livro": "Heróis de Arton",
   "pagina": "255"
  },
  {
   "range": [
    76,
    76
   ],
   "nome": "Couraça de Allihanna (óleo)",
   "preco": "270",
   "livro": "Deuses de Arton",
   "pagina": "60"
  },
  {
   "range": [
    77,
    77
   ],
   "nome": "Toque de Megalokk (aprimoramento para aumentar o dano das armas naturais em um passo e a margem de ameaça delas em +1 )",
   "preco": "480",
   "livro": "Deuses de Arton",
   "pagina": "65"
  },
  {
   "range": [
    78,
    79
   ],
   "nome": "Arma Mágica (óleo; aprimoramento para bônus +3)",
   "preco": "750",
   "livro": "Tormenta20",
   "pagina": "181"
  },
  {
   "range": [
    80,
    81
   ],
   "nome": "Proteção Divina (aprimoramento para bônus de +4)",
   "preco": "750",
   "livro": "Tormenta20",
   "pagina": "202"
  },
  {
   "range": [
    82,
    82
   ],
   "nome": "Armadura Elemental (aprimoramento para 4d6 pontos de dano)",
   "preco": "750",
   "livro": "Heróis de Arton",
   "pagina": "252"
  },
  {
   "range": [
    83,
    88
   ],
   "nome": "Curar Ferimentos (7d8+7 PV)",
   "preco": "1080",
   "livro": "Tormenta20",
   "pagina": "189"
  },
  {
   "range": [
    89,
    90
   ],
   "nome": "Físico Divino (aprimoramento para três atributos)",
   "preco": "1080",
   "livro": "Tormenta20",
   "pagina": "193"
  },
  {
   "range": [
    91,
    92
   ],
   "nome": "Invisibilidade (aprimoramento para duração cena)",
   "preco": "1080",
   "livro": "Tormenta20",
   "pagina": "195"
  },
  {
   "range": [
    93,
    94
   ],
   "nome": "Pele de Pedra",
   "preco": "1080",
   "livro": "Tormenta20",
   "pagina": "201"
  },
  {
   "range": [
    95,
    95
   ],
   "nome": "Potência Divina",
   "preco": "1080",
   "livro": "Tormenta20",
   "pagina": "201"
  },
  {
   "range": [
    96,
    96
   ],
   "nome": "Voo",
   "preco": "1080",
   "livro": "Tormenta20",
   "pagina": "211"
  },
  {
   "range": [
    97,
    97
   ],
   "nome": "Percepção Rubra (aprimoramento para aumentar bônus em +3)",
   "preco": "1080",
   "livro": "Deuses de Arton",
   "pagina": "63"
  },
  {
   "range": [
    98,
    100
   ],
   "nome": "Bola de Fogo (granada; aprimoramento para 10d6 de dano)",
   "preco": "1470",
   "livro": "Tormenta20",
   "pagina": "182"
  },
  {
   "range": [
    101,
    110
   ],
   "nome": "Curar Ferimentos (11d8+11 PV)",
   "preco": "3000",
   "livro": "Tormenta20",
   "pagina": "189"
  },
  {
   "range": [
    111,
    114
   ],
   "nome": "Pele de Pedra (aprimoramento para pele de aço e RD 10)",
   "preco": "3000",
   "livro": "Tormenta20",
   "pagina": "201"
  },
  {
   "range": [
    115,
    116
   ],
   "nome": "Premonição",
   "preco": "3000",
   "livro": "Tormenta20",
   "pagina": "201"
  },
  {
   "range": [
    117,
    117
   ],
   "nome": "Viagem Onírica (aprimoramentos para falar e lançar magias)",
   "preco": "3000",
   "livro": "Heróis de Arton",
   "pagina": "255"
  },
  {
   "range": [
    118,
    118
   ],
   "nome": "Potência Divina (aprimoramento para Força +6 e RD 15)",
   "preco": "6750",
   "livro": "Tormenta20",
   "pagina": "201"
  },
  {
   "range": [
    119,
    119
   ],
   "nome": "Momento de Tormenta (granada; aprimoramento para +4 dados de dano do mesmo tipo)",
   "preco": "6750",
   "livro": "Ameaças de Arton",
   "pagina": "404"
  },
  {
   "range": [
    120,
    120
   ],
   "nome": "Transformação em Dragão (aprimoramentos para atributos +4, asas, arma de mordida e dano de sopro de 12d6+12)",
   "preco": "28000",
   "livro": "Ameaças de Arton",
   "pagina": "405"
  }
 ],
 "equipamentos": {
  "arma": [
   {
    "range": [
     1,
     1
    ],
    "nome": "Açoite finntroll",
    "livro": "Ameaças de Arton",
    "pagina": "392"
   },
   {
    "range": [
     2,
     2
    ],
    "nome": "Adaga",
    "livro": "Tormenta20",
    "pagina": "146"
   },
   {
    "range": [
     3,
     3
    ],
    "nome": "Adaga oposta",
    "livro": "Heróis de Arton",
    "pagina": "216"
   },
   {
    "range": [
     4,
     4
    ],
    "nome": "Agulha de Ahlen",
    "livro": "Heróis de Arton",
    "pagina": "216"
   },
   {
    "range": [
     5,
     5
    ],
    "nome": "Alabarda",
    "livro": "Tormenta20",
    "pagina": "146"
   },
   {
    "range": [
     6,
     6
    ],
    "nome": "Alfange",
    "livro": "Tormenta20",
    "pagina": "146"
   },
   {
    "range": [
     7,
     7
    ],
    "nome": "Arcabuz",
    "livro": "Ameaças de Arton",
    "pagina": "392"
   },
   {
    "range": [
     8,
     8
    ],
    "nome": "Arco curto",
    "livro": "Tormenta20",
    "pagina": "146"
   },
   {
    "range": [
     9,
     9
    ],
    "nome": "Arco de guerra",
    "livro": "Heróis de Arton",
    "pagina": "216"
   },
   {
    "range": [
     10,
     10
    ],
    "nome": "Arco longo",
    "livro": "Tormenta20",
    "pagina": "146"
   },
   {
    "range": [
     11,
     11
    ],
    "nome": "Arco montado",
    "livro": "Heróis de Arton",
    "pagina": "216"
   },
   {
    "range": [
     12,
     12
    ],
    "nome": "Arpão",
    "livro": "Ameaças de Arton",
    "pagina": "392"
   },
   {
    "range": [
     13,
     13
    ],
    "nome": "Azagaia",
    "livro": "Tormenta20",
    "pagina": "146"
   },
   {
    "range": [
     14,
     14
    ],
    "nome": "Bacamarte",
    "livro": "Ameaças de Arton",
    "pagina": "392"
   },
   {
    "range": [
     15,
     15
    ],
    "nome": "Balas (20)",
    "livro": "Tormenta20",
    "pagina": "151"
   },
   {
    "range": [
     16,
     16
    ],
    "nome": "Balestra",
    "livro": "Heróis de Arton",
    "pagina": "216"
   },
   {
    "range": [
     17,
     17
    ],
    "nome": "Bastão lúdico",
    "livro": "Heróis de Arton",
    "pagina": "216"
   },
   {
    "range": [
     18,
     18
    ],
    "nome": "Besta de mão",
    "livro": "Heróis de Arton",
    "pagina": "216"
   },
   {
    "range": [
     19,
     19
    ],
    "nome": "Besta de repetição",
    "livro": "Heróis de Arton",
    "pagina": "216"
   },
   {
    "range": [
     20,
     20
    ],
    "nome": "Besta dupla",
    "livro": "Heróis de Arton",
    "pagina": "216"
   },
   {
    "range": [
     21,
     21
    ],
    "nome": "Besta leve",
    "livro": "Tormenta20",
    "pagina": "146"
   },
   {
    "range": [
     22,
     22
    ],
    "nome": "Besta pesada",
    "livro": "Tormenta20",
    "pagina": "146"
   },
   {
    "range": [
     23,
     23
    ],
    "nome": "Bico de corvo",
    "livro": "Heróis de Arton",
    "pagina": "216"
   },
   {
    "range": [
     24,
     24
    ],
    "nome": "Boleadeira",
    "livro": "Heróis de Arton",
    "pagina": "216"
   },
   {
    "range": [
     25,
     25
    ],
    "nome": "Bordão",
    "livro": "Tormenta20",
    "pagina": "147"
   },
   {
    "range": [
     26,
     26
    ],
    "nome": "Canhão portátil",
    "livro": "Heróis de Arton",
    "pagina": "217"
   },
   {
    "range": [
     27,
     27
    ],
    "nome": "Chakram",
    "livro": "Heróis de Arton",
    "pagina": "217"
   },
   {
    "range": [
     28,
     28
    ],
    "nome": "Chicote",
    "livro": "Tormenta20",
    "pagina": "147"
   },
   {
    "range": [
     29,
     29
    ],
    "nome": "Cimitarra",
    "livro": "Tormenta20",
    "pagina": "147"
   },
   {
    "range": [
     30,
     30
    ],
    "nome": "Cinquedea",
    "livro": "Heróis de Arton",
    "pagina": "217"
   },
   {
    "range": [
     31,
     31
    ],
    "nome": "Clava",
    "livro": "Tormenta20",
    "pagina": "147"
   },
   {
    "range": [
     32,
     32
    ],
    "nome": "Clava-grão",
    "livro": "Heróis de Arton",
    "pagina": "217"
   },
   {
    "range": [
     33,
     33
    ],
    "nome": "Corrente de espinhos",
    "livro": "Tormenta20",
    "pagina": "147"
   },
   {
    "range": [
     34,
     34
    ],
    "nome": "Desmontador",
    "livro": "Heróis de Arton",
    "pagina": "217"
   },
   {
    "range": [
     35,
     35
    ],
    "nome": "Dirk",
    "livro": "Heróis de Arton",
    "pagina": "217"
   },
   {
    "range": [
     36,
     36
    ],
    "nome": "Espada bastarda",
    "livro": "Tormenta20",
    "pagina": "147"
   },
   {
    "range": [
     37,
     37
    ],
    "nome": "Espada canora",
    "livro": "Heróis de Arton",
    "pagina": "217"
   },
   {
    "range": [
     38,
     38
    ],
    "nome": "Espada curta",
    "livro": "Tormenta20",
    "pagina": "148"
   },
   {
    "range": [
     39,
     39
    ],
    "nome": "Espada de execução",
    "livro": "Heróis de Arton",
    "pagina": "217"
   },
   {
    "range": [
     40,
     40
    ],
    "nome": "Espada larga",
    "livro": "Heróis de Arton",
    "pagina": "217"
   },
   {
    "range": [
     41,
     41
    ],
    "nome": "Espada longa",
    "livro": "Tormenta20",
    "pagina": "148"
   },
   {
    "range": [
     42,
     42
    ],
    "nome": "Espada vespa",
    "livro": "Ameaças de Arton",
    "pagina": "392"
   },
   {
    "range": [
     43,
     43
    ],
    "nome": "Espada-gadanho",
    "livro": "Heróis de Arton",
    "pagina": "217"
   },
   {
    "range": [
     44,
     44
    ],
    "nome": "Espadim",
    "livro": "Heróis de Arton",
    "pagina": "217"
   },
   {
    "range": [
     45,
     45
    ],
    "nome": "Flechas (20)",
    "livro": "Tormenta20",
    "pagina": "151"
   },
   {
    "range": [
     46,
     46
    ],
    "nome": "Flechas de caça (20)",
    "livro": "Heróis de Arton",
    "pagina": "223"
   },
   {
    "range": [
     47,
     47
    ],
    "nome": "Florete",
    "livro": "Tormenta20",
    "pagina": "148"
   },
   {
    "range": [
     48,
     48
    ],
    "nome": "Foice",
    "livro": "Tormenta20",
    "pagina": "148"
   },
   {
    "range": [
     49,
     49
    ],
    "nome": "Funda",
    "livro": "Tormenta20",
    "pagina": "148"
   },
   {
    "range": [
     50,
     50
    ],
    "nome": "Gadanho",
    "livro": "Tormenta20",
    "pagina": "148"
   },
   {
    "range": [
     51,
     51
    ],
    "nome": "Garrucha",
    "livro": "Heróis de Arton",
    "pagina": "219"
   },
   {
    "range": [
     52,
     52
    ],
    "nome": "Gládio",
    "livro": "Ameaças de Arton",
    "pagina": "392"
   },
   {
    "range": [
     53,
     53
    ],
    "nome": "Katana",
    "livro": "Tormenta20",
    "pagina": "148"
   },
   {
    "range": [
     54,
     54
    ],
    "nome": "Khopesh",
    "livro": "Heróis de Arton",
    "pagina": "219"
   },
   {
    "range": [
     55,
     55
    ],
    "nome": "Kimbata",
    "livro": "Heróis de Arton",
    "pagina": "219"
   },
   {
    "range": [
     56,
     56
    ],
    "nome": "Lança",
    "livro": "Tormenta20",
    "pagina": "148"
   },
   {
    "range": [
     57,
     57
    ],
    "nome": "Lança de falange",
    "livro": "Heróis de Arton",
    "pagina": "220"
   },
   {
    "range": [
     58,
     58
    ],
    "nome": "Lança de fogo",
    "livro": "Ameaças de Arton",
    "pagina": "392"
   },
   {
    "range": [
     59,
     59
    ],
    "nome": "Lança de justa",
    "livro": "Heróis de Arton",
    "pagina": "220"
   },
   {
    "range": [
     60,
     60
    ],
    "nome": "Lança montada",
    "livro": "Tormenta20",
    "pagina": "148"
   },
   {
    "range": [
     61,
     61
    ],
    "nome": "Maça",
    "livro": "Tormenta20",
    "pagina": "149"
   },
   {
    "range": [
     62,
     62
    ],
    "nome": "Maça-estrela",
    "livro": "Heróis de Arton",
    "pagina": "220"
   },
   {
    "range": [
     63,
     63
    ],
    "nome": "Machadinha",
    "livro": "Tormenta20",
    "pagina": "149"
   },
   {
    "range": [
     64,
     64
    ],
    "nome": "Machado anão",
    "livro": "Tormenta20",
    "pagina": "149"
   },
   {
    "range": [
     65,
     65
    ],
    "nome": "Machado de batalha",
    "livro": "Tormenta20",
    "pagina": "149"
   },
   {
    "range": [
     66,
     66
    ],
    "nome": "Machado de guerra",
    "livro": "Tormenta20",
    "pagina": "149"
   },
   {
    "range": [
     67,
     67
    ],
    "nome": "Machado de haste",
    "livro": "Heróis de Arton",
    "pagina": "220"
   },
   {
    "range": [
     68,
     68
    ],
    "nome": "Machado táurico",
    "livro": "Tormenta20",
    "pagina": "149"
   },
   {
    "range": [
     69,
     69
    ],
    "nome": "Malho",
    "livro": "Heróis de Arton",
    "pagina": "220"
   },
   {
    "range": [
     70,
     70
    ],
    "nome": "Mangual",
    "livro": "Tormenta20",
    "pagina": "149"
   },
   {
    "range": [
     71,
     71
    ],
    "nome": "Marrão",
    "livro": "Heróis de Arton",
    "pagina": "221"
   },
   {
    "range": [
     72,
     72
    ],
    "nome": "Marreta",
    "livro": "Tormenta20",
    "pagina": "149"
   },
   {
    "range": [
     73,
     73
    ],
    "nome": "Martelo de guerra",
    "livro": "Tormenta20",
    "pagina": "149"
   },
   {
    "range": [
     74,
     74
    ],
    "nome": "Martelo leve",
    "livro": "Heróis de Arton",
    "pagina": "221"
   },
   {
    "range": [
     75,
     75
    ],
    "nome": "Martelo longo",
    "livro": "Heróis de Arton",
    "pagina": "221"
   },
   {
    "range": [
     76,
     76
    ],
    "nome": "Montante",
    "livro": "Tormenta20",
    "pagina": "150"
   },
   {
    "range": [
     77,
     77
    ],
    "nome": "Montante cinético",
    "livro": "Heróis de Arton",
    "pagina": "221"
   },
   {
    "range": [
     78,
     78
    ],
    "nome": "Mordida do diabo",
    "livro": "Ameaças de Arton",
    "pagina": "393"
   },
   {
    "range": [
     79,
     79
    ],
    "nome": "Mosquete",
    "livro": "Tormenta20",
    "pagina": "150"
   },
   {
    "range": [
     80,
     80
    ],
    "nome": "Neko-te",
    "livro": "Ameaças de Arton",
    "pagina": "393"
   },
   {
    "range": [
     81,
     81
    ],
    "nome": "Pedras (20)",
    "livro": "Tormenta20",
    "pagina": "151"
   },
   {
    "range": [
     82,
     82
    ],
    "nome": "Picareta",
    "livro": "Tormenta20",
    "pagina": "150"
   },
   {
    "range": [
     83,
     83
    ],
    "nome": "Pique",
    "livro": "Tormenta20",
    "pagina": "150"
   },
   {
    "range": [
     84,
     84
    ],
    "nome": "Pistola",
    "livro": "Tormenta20",
    "pagina": "150"
   },
   {
    "range": [
     85,
     85
    ],
    "nome": "Pistola-punhal",
    "livro": "Ameaças de Arton",
    "pagina": "393"
   },
   {
    "range": [
     86,
     86
    ],
    "nome": "Porrete",
    "livro": "Ameaças de Arton",
    "pagina": "393"
   },
   {
    "range": [
     87,
     87
    ],
    "nome": "Presa de serpente",
    "livro": "Ameaças de Arton",
    "pagina": "393"
   },
   {
    "range": [
     88,
     88
    ],
    "nome": "Rapieira",
    "livro": "Heróis de Arton",
    "pagina": "221"
   },
   {
    "range": [
     89,
     89
    ],
    "nome": "Rede",
    "livro": "Tormenta20",
    "pagina": "150"
   },
   {
    "range": [
     90,
     90
    ],
    "nome": "Serrilheira",
    "livro": "Heróis de Arton",
    "pagina": "221"
   },
   {
    "range": [
     91,
     91
    ],
    "nome": "Shuriken",
    "livro": "Ameaças de Arton",
    "pagina": "394"
   },
   {
    "range": [
     92,
     92
    ],
    "nome": "Sifão cáustico",
    "livro": "Heróis de Arton",
    "pagina": "222"
   },
   {
    "range": [
     93,
     93
    ],
    "nome": "Tacape",
    "livro": "Tormenta20",
    "pagina": "150"
   },
   {
    "range": [
     94,
     94
    ],
    "nome": "Tai-tai",
    "livro": "Heróis de Arton",
    "pagina": "222"
   },
   {
    "range": [
     95,
     95
    ],
    "nome": "Tan-korak",
    "livro": "Heróis de Arton",
    "pagina": "222"
   },
   {
    "range": [
     96,
     96
    ],
    "nome": "Tetsubo",
    "livro": "Ameaças de Arton",
    "pagina": "394"
   },
   {
    "range": [
     97,
     97
    ],
    "nome": "Traque",
    "livro": "Ameaças de Arton",
    "pagina": "394"
   },
   {
    "range": [
     98,
     98
    ],
    "nome": "Tridente",
    "livro": "Tormenta20",
    "pagina": "150"
   },
   {
    "range": [
     99,
     99
    ],
    "nome": "Virotes (20)",
    "livro": "Tormenta20",
    "pagina": "151"
   },
   {
    "range": [
     100,
     100
    ],
    "nome": "Zarabatana",
    "livro": "Ameaças de Arton",
    "pagina": "394"
   }
  ],
  "armadura": [
   {
    "range": [
     1,
     2
    ],
    "nome": "Armadura de chumbo",
    "livro": "Heróis de Arton",
    "pagina": "223"
   },
   {
    "range": [
     3,
     4
    ],
    "nome": "Armadura de engenhoqueiro goblin",
    "livro": "Heróis de Arton",
    "pagina": "223"
   },
   {
    "range": [
     5,
     6
    ],
    "nome": "Armadura de folhas",
    "livro": "Heróis de Arton",
    "pagina": "223"
   },
   {
    "range": [
     7,
     8
    ],
    "nome": "Armadura de hussardo alado",
    "livro": "Heróis de Arton",
    "pagina": "223"
   },
   {
    "range": [
     9,
     10
    ],
    "nome": "Armadura de justa",
    "livro": "Heróis de Arton",
    "pagina": "223"
   },
   {
    "range": [
     11,
     11
    ],
    "nome": "Armadura de ossos",
    "livro": "Ameaças de Arton",
    "pagina": "395"
   },
   {
    "range": [
     12,
     13
    ],
    "nome": "Armadura de pedra",
    "livro": "Heróis de Arton",
    "pagina": "224"
   },
   {
    "range": [
     14,
     14
    ],
    "nome": "Armadura de quitina",
    "livro": "Ameaças de Arton",
    "pagina": "395"
   },
   {
    "range": [
     15,
     16
    ],
    "nome": "Armadura sensual",
    "livro": "Heróis de Arton",
    "pagina": "224"
   },
   {
    "range": [
     17,
     20
    ],
    "nome": "Brigantina",
    "livro": "Heróis de Arton",
    "pagina": "224"
   },
   {
    "range": [
     21,
     22
    ],
    "nome": "Broquel",
    "livro": "Heróis de Arton",
    "pagina": "224"
   },
   {
    "range": [
     23,
     26
    ],
    "nome": "Brunea",
    "livro": "Tormenta20",
    "pagina": "154"
   },
   {
    "range": [
     27,
     28
    ],
    "nome": "Colete fora da lei",
    "livro": "Heróis de Arton",
    "pagina": "226"
   },
   {
    "range": [
     29,
     38
    ],
    "nome": "Completa",
    "livro": "Tormenta20",
    "pagina": "154"
   },
   {
    "range": [
     39,
     42
    ],
    "nome": "Cota de malha",
    "livro": "Tormenta20",
    "pagina": "154"
   },
   {
    "range": [
     43,
     44
    ],
    "nome": "Cota de moedas",
    "livro": "Heróis de Arton",
    "pagina": "226"
   },
   {
    "range": [
     45,
     54
    ],
    "nome": "Couraça",
    "livro": "Tormenta20",
    "pagina": "154"
   },
   {
    "range": [
     55,
     58
    ],
    "nome": "Couro",
    "livro": "Tormenta20",
    "pagina": "154"
   },
   {
    "range": [
     59,
     64
    ],
    "nome": "Couro batido",
    "livro": "Tormenta20",
    "pagina": "154"
   },
   {
    "range": [
     65,
     65
    ],
    "nome": "Escudo de couro",
    "livro": "Ameaças de Arton",
    "pagina": "395"
   },
   {
    "range": [
     66,
     66
    ],
    "nome": "Escudo de vime",
    "livro": "Heróis de Arton",
    "pagina": "226"
   },
   {
    "range": [
     67,
     74
    ],
    "nome": "Escudo leve",
    "livro": "Tormenta20",
    "pagina": "154"
   },
   {
    "range": [
     75,
     82
    ],
    "nome": "Escudo pesado",
    "livro": "Tormenta20",
    "pagina": "154"
   },
   {
    "range": [
     83,
     84
    ],
    "nome": "Escudo torre",
    "livro": "Heróis de Arton",
    "pagina": "226"
   },
   {
    "range": [
     85,
     88
    ],
    "nome": "Gibão de peles",
    "livro": "Tormenta20",
    "pagina": "154"
   },
   {
    "range": [
     89,
     92
    ],
    "nome": "Loriga segmentada",
    "livro": "Tormenta20",
    "pagina": "154"
   },
   {
    "range": [
     93,
     98
    ],
    "nome": "Meia armadura",
    "livro": "Tormenta20",
    "pagina": "154"
   },
   {
    "range": [
     99,
     99
    ],
    "nome": "Sagna",
    "livro": "Heróis de Arton",
    "pagina": "226"
   },
   {
    "range": [
     100,
     100
    ],
    "nome": "Veste de teia de aranha",
    "livro": "Ameaças de Arton",
    "pagina": "395"
   }
  ],
  "esoterico": [
   {
    "range": [
     1,
     3
    ],
    "nome": "Afiador solar",
    "livro": "Deuses de Arton",
    "pagina": "51"
   },
   {
    "range": [
     4,
     6
    ],
    "nome": "Ankh solar",
    "livro": "Ameaças de Arton",
    "pagina": "396"
   },
   {
    "range": [
     7,
     10
    ],
    "nome": "Báculo da retribuição",
    "livro": "Deuses de Arton",
    "pagina": "51"
   },
   {
    "range": [
     11,
     14
    ],
    "nome": "Bolsa de pó",
    "livro": "Tormenta20",
    "pagina": "159"
   },
   {
    "range": [
     15,
     18
    ],
    "nome": "Cajado arcano",
    "livro": "Tormenta20",
    "pagina": "160"
   },
   {
    "range": [
     19,
     22
    ],
    "nome": "Cetro elemental",
    "livro": "Tormenta20",
    "pagina": "160"
   },
   {
    "range": [
     23,
     26
    ],
    "nome": "Compasso mistico",
    "livro": "Heróis de Arton",
    "pagina": "234"
   },
   {
    "range": [
     27,
     30
    ],
    "nome": "Contas de oração",
    "livro": "Deuses de Arton",
    "pagina": "51"
   },
   {
    "range": [
     31,
     34
    ],
    "nome": "Costela de lich",
    "livro": "Tormenta20",
    "pagina": "160"
   },
   {
    "range": [
     35,
     38
    ],
    "nome": "Dedo de ente",
    "livro": "Tormenta20",
    "pagina": "160"
   },
   {
    "range": [
     39,
     42
    ],
    "nome": "Estola",
    "livro": "Deuses de Arton",
    "pagina": "51"
   },
   {
    "range": [
     43,
     46
    ],
    "nome": "Flauta convocadora",
    "livro": "Heróis de Arton",
    "pagina": "234"
   },
   {
    "range": [
     47,
     50
    ],
    "nome": "Frasco purificador",
    "livro": "Deuses de Arton",
    "pagina": "51"
   },
   {
    "range": [
     51,
     54
    ],
    "nome": "Luva de ferro",
    "livro": "Tormenta20",
    "pagina": "160"
   },
   {
    "range": [
     55,
     58
    ],
    "nome": "Mandala onírica",
    "livro": "Heróis de Arton",
    "pagina": "234"
   },
   {
    "range": [
     59,
     62
    ],
    "nome": "Medalhão afiado",
    "livro": "Deuses de Arton",
    "pagina": "51"
   },
   {
    "range": [
     63,
     66
    ],
    "nome": "Medalhão de prata",
    "livro": "Tormenta20",
    "pagina": "160"
   },
   {
    "range": [
     67,
     70
    ],
    "nome": "Orbe cristalino",
    "livro": "Tormenta20",
    "pagina": "160"
   },
   {
    "range": [
     71,
     74
    ],
    "nome": "Ostensório santificado",
    "livro": "Deuses de Arton",
    "pagina": "51"
   },
   {
    "range": [
     75,
     78
    ],
    "nome": "Rede de almas",
    "livro": "Deuses de Arton",
    "pagina": "52"
   },
   {
    "range": [
     79,
     81
    ],
    "nome": "Tomo de guerra",
    "livro": "Ameaças de Arton",
    "pagina": "396"
   },
   {
    "range": [
     82,
     84
    ],
    "nome": "Tomo do rancor",
    "livro": "Ameaças de Arton",
    "pagina": "396"
   },
   {
    "range": [
     85,
     88
    ],
    "nome": "Tomo hermético",
    "livro": "Tormenta20",
    "pagina": "160"
   },
   {
    "range": [
     89,
     92
    ],
    "nome": "Turíbulo ungido",
    "livro": "Deuses de Arton",
    "pagina": "52"
   },
   {
    "range": [
     93,
     96
    ],
    "nome": "Varinha arcana",
    "livro": "Tormenta20",
    "pagina": "160"
   },
   {
    "range": [
     97,
     100
    ],
    "nome": "Varinha armamentista",
    "livro": "Heróis de Arton",
    "pagina": "234"
   }
  ]
 },
 "superiores": {
  "arma": [
   {
    "range": [
     1,
     10
    ],
    "nome": "Atroz*",
    "livro": "Tormenta20",
    "pagina": "164"
   },
   {
    "range": [
     11,
     12
    ],
    "nome": "Banhada a ouro",
    "livro": "Tormenta20",
    "pagina": "164"
   },
   {
    "range": [
     13,
     20
    ],
    "nome": "Certeira",
    "livro": "Tormenta20",
    "pagina": "164"
   },
   {
    "range": [
     21,
     21
    ],
    "nome": "Conduíte",
    "livro": "Deuses de Arton",
    "pagina": "54"
   },
   {
    "range": [
     22,
     23
    ],
    "nome": "Cravejada de gemas",
    "livro": "Tormenta20",
    "pagina": "164"
   },
   {
    "range": [
     24,
     31
    ],
    "nome": "Cruel",
    "livro": "Tormenta20",
    "pagina": "164"
   },
   {
    "range": [
     32,
     33
    ],
    "nome": "Discreta",
    "livro": "Tormenta20",
    "pagina": "164"
   },
   {
    "range": [
     34,
     38
    ],
    "nome": "Equilibrada",
    "livro": "Tormenta20",
    "pagina": "165"
   },
   {
    "range": [
     39,
     42
    ],
    "nome": "Farpada",
    "livro": "Heróis de Arton",
    "pagina": "239"
   },
   {
    "range": [
     43,
     44
    ],
    "nome": "Guarda",
    "livro": "Heróis de Arton",
    "pagina": "239"
   },
   {
    "range": [
     45,
     48
    ],
    "nome": "Harmonizada",
    "livro": "Tormenta20",
    "pagina": "165"
   },
   {
    "range": [
     49,
     49
    ],
    "nome": "Incendiária",
    "livro": "Heróis de Arton",
    "pagina": "239"
   },
   {
    "range": [
     50,
     53
    ],
    "nome": "Injeção alquímica",
    "livro": "Tormenta20",
    "pagina": "165"
   },
   {
    "range": [
     54,
     55
    ],
    "nome": "Macabra",
    "livro": "Tormenta20",
    "pagina": "165"
   },
   {
    "range": [
     56,
     65
    ],
    "nome": "Maciça",
    "livro": "Tormenta20",
    "pagina": "165"
   },
   {
    "range": [
     66,
     75
    ],
    "nome": "Material especial**",
    "livro": "Tormenta20",
    "pagina": "165"
   },
   {
    "range": [
     76,
     79
    ],
    "nome": "Mira telescópica",
    "livro": "Tormenta20",
    "pagina": "166"
   },
   {
    "range": [
     80,
     87
    ],
    "nome": "Precisa",
    "livro": "Tormenta20",
    "pagina": "166"
   },
   {
    "range": [
     88,
     89
    ],
    "nome": "Pressurizada",
    "livro": "Heróis de Arton",
    "pagina": "240"
   },
   {
    "range": [
     90,
     99
    ],
    "nome": "Pungente*",
    "livro": "Tormenta20",
    "pagina": "166"
   },
   {
    "range": [
     100,
     100
    ],
    "nome": "Usada",
    "livro": "Heróis de Arton",
    "pagina": "240"
   }
  ],
  "armadura": [
   {
    "range": [
     1,
     10
    ],
    "nome": "Ajustada",
    "livro": "Tormenta20",
    "pagina": "164"
   },
   {
    "range": [
     11,
     14
    ],
    "nome": "Balístico",
    "livro": "Heróis de Arton",
    "pagina": "239"
   },
   {
    "range": [
     15,
     18
    ],
    "nome": "Banhada a ouro",
    "livro": "Tormenta20",
    "pagina": "164"
   },
   {
    "range": [
     19,
     22
    ],
    "nome": "Cravejada de gemas",
    "livro": "Tormenta20",
    "pagina": "164"
   },
   {
    "range": [
     23,
     27
    ],
    "nome": "Delicada",
    "livro": "Tormenta20",
    "pagina": "164"
   },
   {
    "range": [
     28,
     29
    ],
    "nome": "Deslumbrante*",
    "livro": "Heróis de Arton",
    "pagina": "239"
   },
   {
    "range": [
     30,
     31
    ],
    "nome": "Diligente",
    "livro": "Deuses de Arton",
    "pagina": "54"
   },
   {
    "range": [
     32,
     35
    ],
    "nome": "Discreta",
    "livro": "Tormenta20",
    "pagina": "164"
   },
   {
    "range": [
     36,
     39
    ],
    "nome": "Espinhos",
    "livro": "Tormenta20",
    "pagina": "165"
   },
   {
    "range": [
     40,
     43
    ],
    "nome": "Injetora",
    "livro": "Heróis de Arton",
    "pagina": "240"
   },
   {
    "range": [
     44,
     47
    ],
    "nome": "Inscrito",
    "livro": "Deuses de Arton",
    "pagina": "54"
   },
   {
    "range": [
     48,
     49
    ],
    "nome": "Macabra",
    "livro": "Tormenta20",
    "pagina": "165"
   },
   {
    "range": [
     50,
     59
    ],
    "nome": "Material especial**",
    "livro": "Tormenta20",
    "pagina": "165"
   },
   {
    "range": [
     60,
     64
    ],
    "nome": "Polida",
    "livro": "Tormenta20",
    "pagina": "166"
   },
   {
    "range": [
     65,
     84
    ],
    "nome": "Reforçada",
    "livro": "Tormenta20",
    "pagina": "166"
   },
   {
    "range": [
     85,
     95
    ],
    "nome": "Selada",
    "livro": "Tormenta20",
    "pagina": "166"
   },
   {
    "range": [
     96,
     100
    ],
    "nome": "Sob medida*",
    "livro": "Tormenta20",
    "pagina": "166"
   }
  ],
  "esoterico": [
   {
    "range": [
     1,
     3
    ],
    "nome": "Banhado a ouro",
    "livro": "Tormenta20",
    "pagina": "164"
   },
   {
    "range": [
     4,
     18
    ],
    "nome": "Canalizador",
    "livro": "Tormenta20",
    "pagina": "164"
   },
   {
    "range": [
     19,
     21
    ],
    "nome": "Canônico",
    "livro": "Deuses de Arton",
    "pagina": "54"
   },
   {
    "range": [
     22,
     24
    ],
    "nome": "Cravejado de gemas",
    "livro": "Tormenta20",
    "pagina": "164"
   },
   {
    "range": [
     25,
     28
    ],
    "nome": "Discreto",
    "livro": "Tormenta20",
    "pagina": "164"
   },
   {
    "range": [
     29,
     43
    ],
    "nome": "Energético",
    "livro": "Tormenta20",
    "pagina": "165"
   },
   {
    "range": [
     44,
     58
    ],
    "nome": "Harmonizado",
    "livro": "Tormenta20",
    "pagina": "165"
   },
   {
    "range": [
     59,
     61
    ],
    "nome": "Macabro",
    "livro": "Tormenta20",
    "pagina": "165"
   },
   {
    "range": [
     62,
     70
    ],
    "nome": "Material especial**",
    "livro": "Tormenta20",
    "pagina": "165"
   },
   {
    "range": [
     71,
     80
    ],
    "nome": "Poderoso",
    "livro": "Tormenta20",
    "pagina": "166"
   },
   {
    "range": [
     81,
     90
    ],
    "nome": "Potencializador*",
    "livro": "Heróis de Arton",
    "pagina": "240"
   },
   {
    "range": [
     91,
     100
    ],
    "nome": "Vigilante",
    "livro": "Tormenta20",
    "pagina": "166"
   }
  ]
 },
 "magicos": {
  "arma": [
   {
    "range": [
     1,
     1
    ],
    "nome": "Alvorada",
    "livro": "Heróis de Arton",
    "pagina": "256"
   },
   {
    "range": [
     2,
     5
    ],
    "nome": "Ameaçadora",
    "livro": "Tormenta20",
    "pagina": "335"
   },
   {
    "range": [
     6,
     6
    ],
    "nome": "Anátema",
    "livro": "Heróis de Arton",
    "pagina": "256"
   },
   {
    "range": [
     7,
     8
    ],
    "nome": "Anticriatura",
    "livro": "Tormenta20",
    "pagina": "335"
   },
   {
    "range": [
     9,
     9
    ],
    "nome": "Arremesso",
    "livro": "Tormenta20",
    "pagina": "335"
   },
   {
    "range": [
     10,
     10
    ],
    "nome": "Assassina",
    "livro": "Tormenta20",
    "pagina": "335"
   },
   {
    "range": [
     11,
     11
    ],
    "nome": "Brumosa",
    "livro": "Heróis de Arton",
    "pagina": "256"
   },
   {
    "range": [
     12,
     12
    ],
    "nome": "Caçadora",
    "livro": "Tormenta20",
    "pagina": "335"
   },
   {
    "range": [
     13,
     13
    ],
    "nome": "Cantante",
    "livro": "Heróis de Arton",
    "pagina": "256"
   },
   {
    "range": [
     14,
     14
    ],
    "nome": "Ciclônica",
    "livro": "Heróis de Arton",
    "pagina": "256"
   },
   {
    "range": [
     15,
     18
    ],
    "nome": "Congelante",
    "livro": "Tormenta20",
    "pagina": "335"
   },
   {
    "range": [
     19,
     19
    ],
    "nome": "Conjuradora",
    "livro": "Tormenta20",
    "pagina": "335"
   },
   {
    "range": [
     20,
     23
    ],
    "nome": "Corrosiva",
    "livro": "Tormenta20",
    "pagina": "335"
   },
   {
    "range": [
     24,
     25
    ],
    "nome": "Crescente",
    "livro": "Heróis de Arton",
    "pagina": "256"
   },
   {
    "range": [
     26,
     26
    ],
    "nome": "Cristalina",
    "livro": "Heróis de Arton",
    "pagina": "256"
   },
   {
    "range": [
     27,
     27
    ],
    "nome": "Cronal*",
    "livro": "Heróis de Arton",
    "pagina": "256"
   },
   {
    "range": [
     28,
     28
    ],
    "nome": "Cuidadora",
    "livro": "Heróis de Arton",
    "pagina": "256"
   },
   {
    "range": [
     29,
     30
    ],
    "nome": "Dançarina",
    "livro": "Tormenta20",
    "pagina": "335"
   },
   {
    "range": [
     31,
     32
    ],
    "nome": "Defensora",
    "livro": "Tormenta20",
    "pagina": "335"
   },
   {
    "range": [
     33,
     33
    ],
    "nome": "Destruidora",
    "livro": "Tormenta20",
    "pagina": "335"
   },
   {
    "range": [
     34,
     35
    ],
    "nome": "Dilacerante",
    "livro": "Tormenta20",
    "pagina": "335"
   },
   {
    "range": [
     36,
     36
    ],
    "nome": "Drenante",
    "livro": "Tormenta20",
    "pagina": "335"
   },
   {
    "range": [
     37,
     40
    ],
    "nome": "Elétrica",
    "livro": "Tormenta20",
    "pagina": "335"
   },
   {
    "range": [
     41,
     41
    ],
    "nome": "Energética*",
    "livro": "Tormenta20",
    "pagina": "335"
   },
   {
    "range": [
     42,
     43
    ],
    "nome": "Espreitadora",
    "livro": "Heróis de Arton",
    "pagina": "256"
   },
   {
    "range": [
     44,
     45
    ],
    "nome": "Excruciante",
    "livro": "Tormenta20",
    "pagina": "335"
   },
   {
    "range": [
     46,
     49
    ],
    "nome": "Flamejante",
    "livro": "Tormenta20",
    "pagina": "335"
   },
   {
    "range": [
     50,
     57
    ],
    "nome": "Formidável",
    "livro": "Tormenta20",
    "pagina": "336"
   },
   {
    "range": [
     58,
     59
    ],
    "nome": "Frenética",
    "livro": "Heróis de Arton",
    "pagina": "256"
   },
   {
    "range": [
     60,
     60
    ],
    "nome": "Gárgula",
    "livro": "Heróis de Arton",
    "pagina": "256"
   },
   {
    "range": [
     61,
     61
    ],
    "nome": "Horrenda",
    "livro": "Heróis de Arton",
    "pagina": "256"
   },
   {
    "range": [
     62,
     62
    ],
    "nome": "Indignada",
    "livro": "Heróis de Arton",
    "pagina": "256"
   },
   {
    "range": [
     63,
     63
    ],
    "nome": "Infestada",
    "livro": "Heróis de Arton",
    "pagina": "256"
   },
   {
    "range": [
     64,
     64
    ],
    "nome": "Lancinante*",
    "livro": "Tormenta20",
    "pagina": "336"
   },
   {
    "range": [
     65,
     72
    ],
    "nome": "Magnífica*",
    "livro": "Tormenta20",
    "pagina": "336"
   },
   {
    "range": [
     73,
     73
    ],
    "nome": "Manáfaga",
    "livro": "Heróis de Arton",
    "pagina": "256"
   },
   {
    "range": [
     74,
     75
    ],
    "nome": "Piedosa",
    "livro": "Tormenta20",
    "pagina": "336"
   },
   {
    "range": [
     76,
     76
    ],
    "nome": "Profana",
    "livro": "Tormenta20",
    "pagina": "336"
   },
   {
    "range": [
     77,
     77
    ],
    "nome": "Rebote",
    "livro": "Heróis de Arton",
    "pagina": "256"
   },
   {
    "range": [
     78,
     78
    ],
    "nome": "Reflexiva",
    "livro": "Heróis de Arton",
    "pagina": "257"
   },
   {
    "range": [
     79,
     79
    ],
    "nome": "Ressonante",
    "livro": "Heróis de Arton",
    "pagina": "257"
   },
   {
    "range": [
     80,
     80
    ],
    "nome": "Sagrada",
    "livro": "Tormenta20",
    "pagina": "336"
   },
   {
    "range": [
     81,
     82
    ],
    "nome": "Sanguinária",
    "livro": "Tormenta20",
    "pagina": "336"
   },
   {
    "range": [
     83,
     83
    ],
    "nome": "Sepulcral",
    "livro": "Heróis de Arton",
    "pagina": "257"
   },
   {
    "range": [
     84,
     84
    ],
    "nome": "Sombria",
    "livro": "Heróis de Arton",
    "pagina": "257"
   },
   {
    "range": [
     85,
     85
    ],
    "nome": "Trovejante",
    "livro": "Tormenta20",
    "pagina": "336"
   },
   {
    "range": [
     86,
     86
    ],
    "nome": "Tumular",
    "livro": "Tormenta20",
    "pagina": "336"
   },
   {
    "range": [
     87,
     87
    ],
    "nome": "Vampírica",
    "livro": "Heróis de Arton",
    "pagina": "257"
   },
   {
    "range": [
     88,
     89
    ],
    "nome": "Veloz",
    "livro": "Tormenta20",
    "pagina": "336"
   },
   {
    "range": [
     90,
     90
    ],
    "nome": "Venenosa",
    "livro": "Tormenta20",
    "pagina": "336"
   },
   {
    "range": [
     91,
     100
    ],
    "nome": "Arma específica",
    "livro": "Role na tabela abaixo",
    "pagina": "–"
   },
   {
    "range": [
     1,
     2
    ],
    "nome": "Adaga da bruma",
    "livro": "Heróis de Arton",
    "pagina": "257"
   },
   {
    "range": [
     3,
     3
    ],
    "nome": "Adaga ofídica",
    "livro": "Deuses de Arton",
    "pagina": "58"
   },
   {
    "range": [
     4,
     4
    ],
    "nome": "Adaga sorrateira",
    "livro": "Deuses de Arton",
    "pagina": "56"
   },
   {
    "range": [
     5,
     5
    ],
    "nome": "Alabarda da coragem",
    "livro": "Deuses de Arton",
    "pagina": "57"
   },
   {
    "range": [
     6,
     6
    ],
    "nome": "Alfange dourado",
    "livro": "Deuses de Arton",
    "pagina": "56"
   },
   {
    "range": [
     7,
     7
    ],
    "nome": "Alguma coisa de Nimb...",
    "livro": "Deuses de Arton",
    "pagina": "58"
   },
   {
    "range": [
     8,
     10
    ],
    "nome": "Arco das sombras",
    "livro": "Heróis de Arton",
    "pagina": "257"
   },
   {
    "range": [
     11,
     12
    ],
    "nome": "Arco do crepúsculo",
    "livro": "Heróis de Arton",
    "pagina": "257"
   },
   {
    "range": [
     13,
     15
    ],
    "nome": "Arco do poder",
    "livro": "Tormenta20",
    "pagina": "336"
   },
   {
    "range": [
     16,
     18
    ],
    "nome": "Avalanche",
    "livro": "Tormenta20",
    "pagina": "337"
   },
   {
    "range": [
     19,
     21
    ],
    "nome": "Azagaia dos relâmpagos",
    "livro": "Tormenta20",
    "pagina": "337"
   },
   {
    "range": [
     22,
     23
    ],
    "nome": "Azagaia fantasma",
    "livro": "Heróis de Arton",
    "pagina": "257"
   },
   {
    "range": [
     24,
     26
    ],
    "nome": "Besta estelar",
    "livro": "Heróis de Arton",
    "pagina": "257"
   },
   {
    "range": [
     27,
     29
    ],
    "nome": "Besta explosiva",
    "livro": "Tormenta20",
    "pagina": "337"
   },
   {
    "range": [
     30,
     30
    ],
    "nome": "Bordão sabichão",
    "livro": "Deuses de Arton",
    "pagina": "58"
   },
   {
    "range": [
     31,
     31
    ],
    "nome": "Cajado das matas",
    "livro": "Deuses de Arton",
    "pagina": "55"
   },
   {
    "range": [
     32,
     32
    ],
    "nome": "Cimitarra solar",
    "livro": "Deuses de Arton",
    "pagina": "56"
   },
   {
    "range": [
     33,
     34
    ],
    "nome": "Clava de lava",
    "livro": "Heróis de Arton",
    "pagina": "257"
   },
   {
    "range": [
     35,
     37
    ],
    "nome": "Espada baronial",
    "livro": "Tormenta20",
    "pagina": "337"
   },
   {
    "range": [
     38,
     39
    ],
    "nome": "Espada da tempestade",
    "livro": "Heróis de Arton",
    "pagina": "257"
   },
   {
    "range": [
     40,
     42
    ],
    "nome": "Espada do guardião",
    "livro": "Heróis de Arton",
    "pagina": "257"
   },
   {
    "range": [
     43,
     43
    ],
    "nome": "Espada imaculada",
    "livro": "Deuses de Arton",
    "pagina": "59"
   },
   {
    "range": [
     44,
     44
    ],
    "nome": "Espada monástica",
    "livro": "Deuses de Arton",
    "pagina": "57"
   },
   {
    "range": [
     45,
     46
    ],
    "nome": "Espada solar",
    "livro": "Heróis de Arton",
    "pagina": "257"
   },
   {
    "range": [
     47,
     49
    ],
    "nome": "Espada sortuda",
    "livro": "Tormenta20",
    "pagina": "337"
   },
   {
    "range": [
     50,
     51
    ],
    "nome": "Florete do vendaval",
    "livro": "Heróis de Arton",
    "pagina": "258"
   },
   {
    "range": [
     52,
     54
    ],
    "nome": "Florete fugaz",
    "livro": "Tormenta20",
    "pagina": "337"
   },
   {
    "range": [
     55,
     55
    ],
    "nome": "Katana da determinação",
    "livro": "Deuses de Arton",
    "pagina": "57"
   },
   {
    "range": [
     56,
     58
    ],
    "nome": "Lâmina da luz",
    "livro": "Tormenta20",
    "pagina": "338"
   },
   {
    "range": [
     59,
     61
    ],
    "nome": "Lança animalesca",
    "livro": "Tormenta20",
    "pagina": "338"
   },
   {
    "range": [
     62,
     62
    ],
    "nome": "Lança da dominação",
    "livro": "Deuses de Arton",
    "pagina": "56"
   },
   {
    "range": [
     63,
     64
    ],
    "nome": "Lança da fênix",
    "livro": "Heróis de Arton",
    "pagina": "258"
   },
   {
    "range": [
     65,
     67
    ],
    "nome": "Língua do deserto",
    "livro": "Tormenta20",
    "pagina": "338"
   },
   {
    "range": [
     68,
     70
    ],
    "nome": "Maça do terror",
    "livro": "Tormenta20",
    "pagina": "338"
   },
   {
    "range": [
     71,
     71
    ],
    "nome": "Maça monstruosa",
    "livro": "Deuses de Arton",
    "pagina": "58"
   },
   {
    "range": [
     72,
     72
    ],
    "nome": "Machado da bravura",
    "livro": "Deuses de Arton",
    "pagina": "55"
   },
   {
    "range": [
     73,
     74
    ],
    "nome": "Machado da natureza",
    "livro": "Heróis de Arton",
    "pagina": "258"
   },
   {
    "range": [
     75,
     76
    ],
    "nome": "Machado do abismo",
    "livro": "Heróis de Arton",
    "pagina": "258"
   },
   {
    "range": [
     77,
     79
    ],
    "nome": "Machado do vulcão",
    "livro": "Heróis de Arton",
    "pagina": "258"
   },
   {
    "range": [
     80,
     80
    ],
    "nome": "Machado lamnoriano",
    "livro": "Deuses de Arton",
    "pagina": "59"
   },
   {
    "range": [
     81,
     83
    ],
    "nome": "Machado silvestre",
    "livro": "Tormenta20",
    "pagina": "338"
   },
   {
    "range": [
     84,
     84
    ],
    "nome": "Mangual aventureiro",
    "livro": "Deuses de Arton",
    "pagina": "59"
   },
   {
    "range": [
     85,
     86
    ],
    "nome": "Martelo da terra",
    "livro": "Heróis de Arton",
    "pagina": "258"
   },
   {
    "range": [
     87,
     89
    ],
    "nome": "Martelo de Doherimm",
    "livro": "Tormenta20",
    "pagina": "338"
   },
   {
    "range": [
     90,
     91
    ],
    "nome": "Martelo do titã",
    "livro": "Heróis de Arton",
    "pagina": "258"
   },
   {
    "range": [
     92,
     93
    ],
    "nome": "Punhal das profundezas",
    "livro": "Heróis de Arton",
    "pagina": "258"
   },
   {
    "range": [
     94,
     96
    ],
    "nome": "Punhal sszzaazita",
    "livro": "Tormenta20",
    "pagina": "338"
   },
   {
    "range": [
     97,
     97
    ],
    "nome": "Tridente aquoso",
    "livro": "Deuses de Arton",
    "pagina": "58"
   },
   {
    "range": [
     98,
     100
    ],
    "nome": "Vingadora sagrada",
    "livro": "Tormenta20",
    "pagina": "338"
   }
  ],
  "armadura": [
   {
    "range": [
     1,
     2
    ],
    "nome": "Abascanto",
    "livro": "Tormenta20",
    "pagina": "338"
   },
   {
    "range": [
     3,
     4
    ],
    "nome": "Abençoado",
    "livro": "Tormenta20",
    "pagina": "338"
   },
   {
    "range": [
     5,
     5
    ],
    "nome": "Abissal",
    "livro": "Heróis de Arton",
    "pagina": "258"
   },
   {
    "range": [
     6,
     6
    ],
    "nome": "Acrobático",
    "livro": "Tormenta20",
    "pagina": "338"
   },
   {
    "range": [
     7,
     8
    ],
    "nome": "Alado",
    "livro": "Tormenta20",
    "pagina": "338"
   },
   {
    "range": [
     9,
     9
    ],
    "nome": "Ancorada*",
    "livro": "Heróis de Arton",
    "pagina": "258"
   },
   {
    "range": [
     10,
     11
    ],
    "nome": "Animado**",
    "livro": "Tormenta20",
    "pagina": "338"
   },
   {
    "range": [
     12,
     12
    ],
    "nome": "Anulador***",
    "livro": "Heróis de Arton",
    "pagina": "258"
   },
   {
    "range": [
     13,
     13
    ],
    "nome": "Arbóreo",
    "livro": "Heróis de Arton",
    "pagina": "258"
   },
   {
    "range": [
     14,
     15
    ],
    "nome": "Assustador",
    "livro": "Tormenta20",
    "pagina": "338"
   },
   {
    "range": [
     16,
     16
    ],
    "nome": "Astuto",
    "livro": "Heróis de Arton",
    "pagina": "258"
   },
   {
    "range": [
     17,
     17
    ],
    "nome": "Cáustica",
    "livro": "Tormenta20",
    "pagina": "338"
   },
   {
    "range": [
     18,
     27
    ],
    "nome": "Defensor",
    "livro": "Tormenta20",
    "pagina": "338"
   },
   {
    "range": [
     28,
     28
    ],
    "nome": "Densa*",
    "livro": "Heróis de Arton",
    "pagina": "258"
   },
   {
    "range": [
     29,
     29
    ],
    "nome": "Égide",
    "livro": "Heróis de Arton",
    "pagina": "258"
   },
   {
    "range": [
     30,
     30
    ],
    "nome": "Enraizada*",
    "livro": "Heróis de Arton",
    "pagina": "258"
   },
   {
    "range": [
     31,
     31
    ],
    "nome": "Escorregadio",
    "livro": "Tormenta20",
    "pagina": "338"
   },
   {
    "range": [
     32,
     33
    ],
    "nome": "Esmagador**",
    "livro": "Tormenta20",
    "pagina": "339"
   },
   {
    "range": [
     34,
     34
    ],
    "nome": "Esmérico",
    "livro": "Heróis de Arton",
    "pagina": "258"
   },
   {
    "range": [
     35,
     36
    ],
    "nome": "Estígio***",
    "livro": "Heróis de Arton",
    "pagina": "258"
   },
   {
    "range": [
     37,
     37
    ],
    "nome": "Etéreo",
    "livro": "Heróis de Arton",
    "pagina": "259"
   },
   {
    "range": [
     38,
     39
    ],
    "nome": "Fantasmagórico",
    "livro": "Tormenta20",
    "pagina": "339"
   },
   {
    "range": [
     40,
     43
    ],
    "nome": "Fortificado",
    "livro": "Tormenta20",
    "pagina": "339"
   },
   {
    "range": [
     44,
     44
    ],
    "nome": "Gélido",
    "livro": "Tormenta20",
    "pagina": "339"
   },
   {
    "range": [
     45,
     45
    ],
    "nome": "Geomântico",
    "livro": "Heróis de Arton",
    "pagina": "259"
   },
   {
    "range": [
     46,
     55
    ],
    "nome": "Guardião***",
    "livro": "Tormenta20",
    "pagina": "339"
   },
   {
    "range": [
     56,
     57
    ],
    "nome": "Hipnótico",
    "livro": "Tormenta20",
    "pagina": "339"
   },
   {
    "range": [
     58,
     58
    ],
    "nome": "Ilusório",
    "livro": "Tormenta20",
    "pagina": "339"
   },
   {
    "range": [
     59,
     59
    ],
    "nome": "Incandescente",
    "livro": "Tormenta20",
    "pagina": "339"
   },
   {
    "range": [
     60,
     64
    ],
    "nome": "Invulnerável",
    "livro": "Tormenta20",
    "pagina": "339"
   },
   {
    "range": [
     65,
     65
    ],
    "nome": "Ligeira*",
    "livro": "Heróis de Arton",
    "pagina": "259"
   },
   {
    "range": [
     66,
     67
    ],
    "nome": "Luminescente",
    "livro": "Heróis de Arton",
    "pagina": "259"
   },
   {
    "range": [
     68,
     72
    ],
    "nome": "Opaco",
    "livro": "Tormenta20",
    "pagina": "339"
   },
   {
    "range": [
     73,
     73
    ],
    "nome": "Prístino",
    "livro": "Heróis de Arton",
    "pagina": "259"
   },
   {
    "range": [
     74,
     78
    ],
    "nome": "Protetor",
    "livro": "Tormenta20",
    "pagina": "339"
   },
   {
    "range": [
     79,
     79
    ],
    "nome": "Purificador",
    "livro": "Heróis de Arton",
    "pagina": "259"
   },
   {
    "range": [
     80,
     81
    ],
    "nome": "Reanimador",
    "livro": "Heróis de Arton",
    "pagina": "259"
   },
   {
    "range": [
     82,
     83
    ],
    "nome": "Refletor",
    "livro": "Tormenta20",
    "pagina": "339"
   },
   {
    "range": [
     84,
     84
    ],
    "nome": "Relampejante",
    "livro": "Tormenta20",
    "pagina": "339"
   },
   {
    "range": [
     85,
     85
    ],
    "nome": "Reluzente",
    "livro": "Tormenta20",
    "pagina": "339"
   },
   {
    "range": [
     86,
     86
    ],
    "nome": "Replicante",
    "livro": "Heróis de Arton",
    "pagina": "259"
   },
   {
    "range": [
     87,
     87
    ],
    "nome": "Resiliente",
    "livro": "Heróis de Arton",
    "pagina": "259"
   },
   {
    "range": [
     88,
     88
    ],
    "nome": "Sombrio",
    "livro": "Tormenta20",
    "pagina": "339"
   },
   {
    "range": [
     89,
     89
    ],
    "nome": "Vórtice",
    "livro": "Heróis de Arton",
    "pagina": "259"
   },
   {
    "range": [
     90,
     90
    ],
    "nome": "Zeloso",
    "livro": "Tormenta20",
    "pagina": "339"
   },
   {
    "range": [
     91,
     100
    ],
    "nome": "Item específico",
    "livro": "Role na tabela abaixo",
    "pagina": "–"
   },
   {
    "range": [
     1,
     4
    ],
    "nome": "Armadura da luz",
    "livro": "Tormenta20",
    "pagina": "340"
   },
   {
    "range": [
     5,
     8
    ],
    "nome": "Armadura das sombras profundas",
    "livro": "Heróis de Arton",
    "pagina": "259"
   },
   {
    "range": [
     9,
     12
    ],
    "nome": "Armadura do dragão ancião",
    "livro": "Heróis de Arton",
    "pagina": "259"
   },
   {
    "range": [
     13,
     16
    ],
    "nome": "Armadura do inverno perene",
    "livro": "Heróis de Arton",
    "pagina": "259"
   },
   {
    "range": [
     17,
     18
    ],
    "nome": "Armadura do julgamento",
    "livro": "Deuses de Arton",
    "pagina": "57"
   },
   {
    "range": [
     19,
     22
    ],
    "nome": "Baluarte anão",
    "livro": "Tormenta20",
    "pagina": "340"
   },
   {
    "range": [
     23,
     26
    ],
    "nome": "Carapaça demoníaca",
    "livro": "Tormenta20",
    "pagina": "340"
   },
   {
    "range": [
     27,
     30
    ],
    "nome": "Cota da serpente marinha",
    "livro": "Heróis de Arton",
    "pagina": "259"
   },
   {
    "range": [
     31,
     40
    ],
    "nome": "Cota élfica",
    "livro": "Tormenta20",
    "pagina": "340"
   },
   {
    "range": [
     41,
     44
    ],
    "nome": "Couraça do comando",
    "livro": "Tormenta20",
    "pagina": "340"
   },
   {
    "range": [
     45,
     48
    ],
    "nome": "Couraça do guardião celeste",
    "livro": "Heróis de Arton",
    "pagina": "259"
   },
   {
    "range": [
     49,
     52
    ],
    "nome": "Couro de monstro",
    "livro": "Tormenta20",
    "pagina": "340"
   },
   {
    "range": [
     53,
     56
    ],
    "nome": "Escudo da ira vulcânica",
    "livro": "Heróis de Arton",
    "pagina": "260"
   },
   {
    "range": [
     57,
     60
    ],
    "nome": "Escudo da luz estelar",
    "livro": "Heróis de Arton",
    "pagina": "260"
   },
   {
    "range": [
     61,
     64
    ],
    "nome": "Escudo da natureza viva",
    "livro": "Heróis de Arton",
    "pagina": "260"
   },
   {
    "range": [
     65,
     68
    ],
    "nome": "Escudo de Azgher",
    "livro": "Tormenta20",
    "pagina": "340"
   },
   {
    "range": [
     69,
     72
    ],
    "nome": "Escudo do conjurador",
    "livro": "Tormenta20",
    "pagina": "340"
   },
   {
    "range": [
     73,
     76
    ],
    "nome": "Escudo do eclipse",
    "livro": "Tormenta20",
    "pagina": "340"
   },
   {
    "range": [
     77,
     80
    ],
    "nome": "Escudo do grifo",
    "livro": "Heróis de Arton",
    "pagina": "260"
   },
   {
    "range": [
     81,
     86
    ],
    "nome": "Escudo do leão",
    "livro": "Tormenta20",
    "pagina": "340"
   },
   {
    "range": [
     87,
     90
    ],
    "nome": "Escudo do trovão",
    "livro": "Heróis de Arton",
    "pagina": "260"
   },
   {
    "range": [
     91,
     94
    ],
    "nome": "Escudo espinhoso",
    "livro": "Tormenta20",
    "pagina": "340"
   },
   {
    "range": [
     95,
     98
    ],
    "nome": "Loriga do centurião",
    "livro": "Tormenta20",
    "pagina": "340"
   },
   {
    "range": [
     99,
     100
    ],
    "nome": "Manto da noite",
    "livro": "Tormenta20",
    "pagina": "340"
   }
  ],
  "esoterico": [
   {
    "range": [
     1,
     2
    ],
    "nome": "Abafador",
    "livro": "Heróis de Arton",
    "pagina": "260"
   },
   {
    "range": [
     3,
     12
    ],
    "nome": "Bélico",
    "livro": "Heróis de Arton",
    "pagina": "260"
   },
   {
    "range": [
     13,
     16
    ],
    "nome": "Caridoso",
    "livro": "Heróis de Arton",
    "pagina": "260"
   },
   {
    "range": [
     17,
     20
    ],
    "nome": "Chocante",
    "livro": "Heróis de Arton",
    "pagina": "260"
   },
   {
    "range": [
     21,
     30
    ],
    "nome": "Clemente",
    "livro": "Heróis de Arton",
    "pagina": "260"
   },
   {
    "range": [
     31,
     32
    ],
    "nome": "Contido",
    "livro": "Heróis de Arton",
    "pagina": "260"
   },
   {
    "range": [
     33,
     34
    ],
    "nome": "Embusteiro",
    "livro": "Heróis de Arton",
    "pagina": "260"
   },
   {
    "range": [
     35,
     36
    ],
    "nome": "Emergencial",
    "livro": "Heróis de Arton",
    "pagina": "260"
   },
   {
    "range": [
     37,
     40
    ],
    "nome": "Encadeado",
    "livro": "Heróis de Arton",
    "pagina": "260"
   },
   {
    "range": [
     41,
     42
    ],
    "nome": "Escultor",
    "livro": "Heróis de Arton",
    "pagina": "260"
   },
   {
    "range": [
     43,
     44
    ],
    "nome": "Frugal",
    "livro": "Heróis de Arton",
    "pagina": "261"
   },
   {
    "range": [
     45,
     48
    ],
    "nome": "Glacial",
    "livro": "Heróis de Arton",
    "pagina": "261"
   },
   {
    "range": [
     49,
     50
    ],
    "nome": "Imperioso",
    "livro": "Heróis de Arton",
    "pagina": "261"
   },
   {
    "range": [
     51,
     52
    ],
    "nome": "Implacável*",
    "livro": "Heróis de Arton",
    "pagina": "261"
   },
   {
    "range": [
     53,
     54
    ],
    "nome": "Incriminador",
    "livro": "Heróis de Arton",
    "pagina": "261"
   },
   {
    "range": [
     55,
     61
    ],
    "nome": "Inflamável",
    "livro": "Heróis de Arton",
    "pagina": "261"
   },
   {
    "range": [
     62,
     65
    ],
    "nome": "Inquisidor",
    "livro": "Heróis de Arton",
    "pagina": "261"
   },
   {
    "range": [
     66,
     69
    ],
    "nome": "Insistente",
    "livro": "Heróis de Arton",
    "pagina": "261"
   },
   {
    "range": [
     70,
     71
    ],
    "nome": "Khalmyrita",
    "livro": "Heróis de Arton",
    "pagina": "261"
   },
   {
    "range": [
     72,
     81
    ],
    "nome": "Majestoso*",
    "livro": "Heróis de Arton",
    "pagina": "261"
   },
   {
    "range": [
     82,
     83
    ],
    "nome": "Nímbico",
    "livro": "Heróis de Arton",
    "pagina": "261"
   },
   {
    "range": [
     84,
     84
    ],
    "nome": "Pulverizante*",
    "livro": "Heróis de Arton",
    "pagina": "261"
   },
   {
    "range": [
     85,
     85
    ],
    "nome": "Retaliador",
    "livro": "Heróis de Arton",
    "pagina": "261"
   },
   {
    "range": [
     86,
     87
    ],
    "nome": "Sanguessuga",
    "livro": "Heróis de Arton",
    "pagina": "261"
   },
   {
    "range": [
     88,
     88
    ],
    "nome": "Traiçoeiro",
    "livro": "Heróis de Arton",
    "pagina": "261"
   },
   {
    "range": [
     89,
     90
    ],
    "nome": "Verdugo",
    "livro": "Heróis de Arton",
    "pagina": "261"
   },
   {
    "range": [
     91,
     100
    ],
    "nome": "Esotérico específico",
    "livro": "Role na tabela abaixo",
    "pagina": "–"
   },
   {
    "range": [
     1,
     20
    ],
    "nome": "Cajado da destruição",
    "livro": "Tormenta20",
    "pagina": "337"
   },
   {
    "range": [
     21,
     40
    ],
    "nome": "Cajado da vida",
    "livro": "Tormenta20",
    "pagina": "337"
   },
   {
    "range": [
     41,
     45
    ],
    "nome": "Cajado das marés",
    "livro": "Heróis de Arton",
    "pagina": "262"
   },
   {
    "range": [
     46,
     60
    ],
    "nome": "Cajado do poder",
    "livro": "Tormenta20",
    "pagina": "337"
   },
   {
    "range": [
     61,
     75
    ],
    "nome": "Cálice sagrado",
    "livro": "Heróis de Arton",
    "pagina": "262"
   },
   {
    "range": [
     76,
     85
    ],
    "nome": "Relógio do arcanista",
    "livro": "Heróis de Arton",
    "pagina": "262"
   },
   {
    "range": [
     86,
     95
    ],
    "nome": "Varinha da generosidade",
    "livro": "Deuses de Arton",
    "pagina": "59"
   },
   {
    "range": [
     96,
     100
    ],
    "nome": "Varinha milenar",
    "livro": "Heróis de Arton",
    "pagina": "262"
   }
  ]
 },
 "acessorios": {
  "menor": [
   {
    "range": [
     1,
     1
    ],
    "nome": "Algibeira mordedora",
    "preco": "1000",
    "livro": "Heróis de Arton",
    "pagina": "263"
   },
   {
    "range": [
     2,
     2
    ],
    "nome": "Elixir da mente dividida",
    "preco": "1500",
    "livro": "Heróis de Arton",
    "pagina": "265"
   },
   {
    "range": [
     3,
     3
    ],
    "nome": "Papiro das estrelas",
    "preco": "1500",
    "livro": "Heróis de Arton",
    "pagina": "267"
   },
   {
    "range": [
     4,
     4
    ],
    "nome": "Anel do sustento",
    "preco": "3000",
    "livro": "Tormenta20",
    "pagina": "342"
   },
   {
    "range": [
     5,
     7
    ],
    "nome": "Bainha mágica",
    "preco": "3000",
    "livro": "Tormenta20",
    "pagina": "342"
   },
   {
    "range": [
     8,
     9
    ],
    "nome": "Corda da escalada",
    "preco": "3000",
    "livro": "Tormenta20",
    "pagina": "343"
   },
   {
    "range": [
     10,
     10
    ],
    "nome": "Ferraduras da velocidade",
    "preco": "3000",
    "livro": "Tormenta20",
    "pagina": "344"
   },
   {
    "range": [
     11,
     12
    ],
    "nome": "Garrafa da fumaça eterna",
    "preco": "3000",
    "livro": "Tormenta20",
    "pagina": "344"
   },
   {
    "range": [
     13,
     15
    ],
    "nome": "Gema da luminosidade",
    "preco": "3000",
    "livro": "Tormenta20",
    "pagina": "344"
   },
   {
    "range": [
     16,
     18
    ],
    "nome": "Manto élfico",
    "preco": "3000",
    "livro": "Tormenta20",
    "pagina": "345"
   },
   {
    "range": [
     19,
     21
    ],
    "nome": "Mochila de carga",
    "preco": "3000",
    "livro": "Tormenta20",
    "pagina": "345"
   },
   {
    "range": [
     22,
     23
    ],
    "nome": "Amuleto da visão etérea",
    "preco": "3000",
    "livro": "Heróis de Arton",
    "pagina": "263"
   },
   {
    "range": [
     24,
     25
    ],
    "nome": "Cinturão do trobo",
    "preco": "3000",
    "livro": "Heróis de Arton",
    "pagina": "264"
   },
   {
    "range": [
     26,
     27
    ],
    "nome": "Elixir da eternidade",
    "preco": "3000",
    "livro": "Heróis de Arton",
    "pagina": "265"
   },
   {
    "range": [
     28,
     29
    ],
    "nome": "Pérola da nulificação",
    "preco": "3000",
    "livro": "Heróis de Arton",
    "pagina": "267"
   },
   {
    "range": [
     30,
     31
    ],
    "nome": "Saco dos ventos silenciosos",
    "preco": "3000",
    "livro": "Heróis de Arton",
    "pagina": "267"
   },
   {
    "range": [
     32,
     36
    ],
    "nome": "Brincos da sagacidade",
    "preco": "4500",
    "livro": "Tormenta20",
    "pagina": "342"
   },
   {
    "range": [
     37,
     41
    ],
    "nome": "Luvas da delicadeza",
    "preco": "4500",
    "livro": "Tormenta20",
    "pagina": "344"
   },
   {
    "range": [
     42,
     46
    ],
    "nome": "Manoplas da força do ogro",
    "preco": "4500",
    "livro": "Tormenta20",
    "pagina": "344"
   },
   {
    "range": [
     47,
     50
    ],
    "nome": "Manto da resistência",
    "preco": "4500",
    "livro": "Tormenta20",
    "pagina": "344"
   },
   {
    "range": [
     51,
     55
    ],
    "nome": "Manto do fascínio",
    "preco": "4500",
    "livro": "Tormenta20",
    "pagina": "344"
   },
   {
    "range": [
     56,
     60
    ],
    "nome": "Pingente da sensatez",
    "preco": "4500",
    "livro": "Tormenta20",
    "pagina": "345"
   },
   {
    "range": [
     61,
     65
    ],
    "nome": "Torque do vigor",
    "preco": "4500",
    "livro": "Tormenta20",
    "pagina": "345"
   },
   {
    "range": [
     66,
     66
    ],
    "nome": "Monóculo da franqueza",
    "preco": "4500",
    "livro": "Heróis de Arton",
    "pagina": "266"
   },
   {
    "range": [
     67,
     68
    ],
    "nome": "Chapéu do disfarce",
    "preco": "6000",
    "livro": "Tormenta20",
    "pagina": "343"
   },
   {
    "range": [
     69,
     69
    ],
    "nome": "Flauta fantasma",
    "preco": "6000",
    "livro": "Tormenta20",
    "pagina": "344"
   },
   {
    "range": [
     70,
     71
    ],
    "nome": "Lanterna da revelação",
    "preco": "6000",
    "livro": "Tormenta20",
    "pagina": "344"
   },
   {
    "range": [
     72,
     73
    ],
    "nome": "Algibeira provedora",
    "preco": "6000",
    "livro": "Heróis de Arton",
    "pagina": "263"
   },
   {
    "range": [
     74,
     75
    ],
    "nome": "Gaiola dos arcanos",
    "preco": "6000",
    "livro": "Heróis de Arton",
    "pagina": "266"
   },
   {
    "range": [
     76,
     77
    ],
    "nome": "Lâmpada da ilusão impecável",
    "preco": "6000",
    "livro": "Heróis de Arton",
    "pagina": "266"
   },
   {
    "range": [
     78,
     79
    ],
    "nome": "Pena da criação",
    "preco": "6000",
    "livro": "Heróis de Arton",
    "pagina": "267"
   },
   {
    "range": [
     80,
     81
    ],
    "nome": "Corda da resignação",
    "preco": "7500",
    "livro": "Heróis de Arton",
    "pagina": "265"
   },
   {
    "range": [
     82,
     86
    ],
    "nome": "Anel da proteção",
    "preco": "9000",
    "livro": "Tormenta20",
    "pagina": "342"
   },
   {
    "range": [
     87,
     87
    ],
    "nome": "Anel do escudo mental",
    "preco": "9000",
    "livro": "Tormenta20",
    "pagina": "342"
   },
   {
    "range": [
     88,
     88
    ],
    "nome": "Pingente da saúde",
    "preco": "9000",
    "livro": "Tormenta20",
    "pagina": "345"
   },
   {
    "range": [
     89,
     89
    ],
    "nome": "Coroa de flores",
    "preco": "9000",
    "livro": "Deuses de Arton",
    "pagina": "55"
   },
   {
    "range": [
     90,
     90
    ],
    "nome": "Jarro das profundezas",
    "preco": "9000",
    "livro": "Deuses de Arton",
    "pagina": "58"
   },
   {
    "range": [
     91,
     91
    ],
    "nome": "Escrivaninha consagrada",
    "preco": "9000",
    "livro": "Deuses de Arton",
    "pagina": "58"
   },
   {
    "range": [
     92,
     92
    ],
    "nome": "Anel da proteção mental",
    "preco": "9000",
    "livro": "Heróis de Arton",
    "pagina": "263"
   },
   {
    "range": [
     93,
     93
    ],
    "nome": "Berço das fadas",
    "preco": "9000",
    "livro": "Heróis de Arton",
    "pagina": "263"
   },
   {
    "range": [
     94,
     94
    ],
    "nome": "Chapéu dos truques infinitos",
    "preco": "9000",
    "livro": "Heróis de Arton",
    "pagina": "264"
   },
   {
    "range": [
     95,
     95
    ],
    "nome": "Cinto da leveza graciosa",
    "preco": "9000",
    "livro": "Heróis de Arton",
    "pagina": "264"
   },
   {
    "range": [
     96,
     96
    ],
    "nome": "Cristal da voz silenciosa",
    "preco": "9000",
    "livro": "Heróis de Arton",
    "pagina": "265"
   },
   {
    "range": [
     97,
     97
    ],
    "nome": "Cristal do tempo célere",
    "preco": "9000",
    "livro": "Heróis de Arton",
    "pagina": "265"
   },
   {
    "range": [
     98,
     98
    ],
    "nome": "Ocarina da melodia distante",
    "preco": "9000",
    "livro": "Heróis de Arton",
    "pagina": "266"
   },
   {
    "range": [
     99,
     99
    ],
    "nome": "Olhos do corvo",
    "preco": "9000",
    "livro": "Heróis de Arton",
    "pagina": "266"
   },
   {
    "range": [
     100,
     100
    ],
    "nome": "Pergaminho da verdade cósmica",
    "preco": "9000",
    "livro": "Heróis de Arton",
    "pagina": "267"
   }
  ],
  "medio": [
   {
    "range": [
     1,
     1
    ],
    "nome": "Anel de telecinesia",
    "preco": "10500",
    "livro": "Tormenta20",
    "pagina": "342"
   },
   {
    "range": [
     2,
     2
    ],
    "nome": "Bola de cristal",
    "preco": "10500",
    "livro": "Tormenta20",
    "pagina": "342"
   },
   {
    "range": [
     3,
     3
    ],
    "nome": "Caveira maldita",
    "preco": "10500",
    "livro": "Tormenta20",
    "pagina": "343"
   },
   {
    "range": [
     4,
     4
    ],
    "nome": "Instrumento da alegria",
    "preco": "10500",
    "livro": "Deuses de Arton",
    "pagina": "57"
   },
   {
    "range": [
     5,
     5
    ],
    "nome": "Ampulheta da harmonia temporal",
    "preco": "10500",
    "livro": "Heróis de Arton",
    "pagina": "263"
   },
   {
    "range": [
     6,
     6
    ],
    "nome": "Amuleto do amparo",
    "preco": "10500",
    "livro": "Heróis de Arton",
    "pagina": "263"
   },
   {
    "range": [
     7,
     7
    ],
    "nome": "Caixa dos ecos perdidos",
    "preco": "10500",
    "livro": "Heróis de Arton",
    "pagina": "264"
   },
   {
    "range": [
     8,
     8
    ],
    "nome": "Colar da perseverança",
    "preco": "10500",
    "livro": "Heróis de Arton",
    "pagina": "264"
   },
   {
    "range": [
     9,
     9
    ],
    "nome": "Colar do tirano",
    "preco": "10500",
    "livro": "Heróis de Arton",
    "pagina": "265"
   },
   {
    "range": [
     10,
     10
    ],
    "nome": "Óculos da revelação",
    "preco": "10500",
    "livro": "Heróis de Arton",
    "pagina": "266"
   },
   {
    "range": [
     11,
     11
    ],
    "nome": "Colar das bolas de fogo",
    "preco": "12000",
    "livro": "Heróis de Arton",
    "pagina": "265"
   },
   {
    "range": [
     12,
     12
    ],
    "nome": "Sandálias de Valkaria",
    "preco": "12000",
    "livro": "Heróis de Arton",
    "pagina": "267"
   },
   {
    "range": [
     13,
     13
    ],
    "nome": "Véu diáfano",
    "preco": "13500",
    "livro": "Deuses de Arton",
    "pagina": "57"
   },
   {
    "range": [
     14,
     14
    ],
    "nome": "Botas aladas",
    "preco": "15000",
    "livro": "Tormenta20",
    "pagina": "342"
   },
   {
    "range": [
     15,
     15
    ],
    "nome": "Botas inquietas",
    "preco": "15000",
    "livro": "Deuses de Arton",
    "pagina": "59"
   },
   {
    "range": [
     16,
     16
    ],
    "nome": "Pira póstera",
    "preco": "15000",
    "livro": "Deuses de Arton",
    "pagina": "59"
   },
   {
    "range": [
     17,
     17
    ],
    "nome": "Anel do pacto oneroso",
    "preco": "15000",
    "livro": "Heróis de Arton",
    "pagina": "263"
   },
   {
    "range": [
     18,
     18
    ],
    "nome": "Botas do andarilho das sombras",
    "preco": "15000",
    "livro": "Heróis de Arton",
    "pagina": "263"
   },
   {
    "range": [
     19,
     19
    ],
    "nome": "Cálice das marés",
    "preco": "15000",
    "livro": "Heróis de Arton",
    "pagina": "264"
   },
   {
    "range": [
     20,
     20
    ],
    "nome": "Cinto dos caminhos cruzados",
    "preco": "15000",
    "livro": "Heróis de Arton",
    "pagina": "264"
   },
   {
    "range": [
     21,
     21
    ],
    "nome": "Pedra da passagem",
    "preco": "15000",
    "livro": "Heróis de Arton",
    "pagina": "267"
   },
   {
    "range": [
     22,
     22
    ],
    "nome": "Pingente da dor partilhada",
    "preco": "15000",
    "livro": "Heróis de Arton",
    "pagina": "267"
   },
   {
    "range": [
     23,
     26
    ],
    "nome": "Braceletes de bronze",
    "preco": "16500",
    "livro": "Tormenta20",
    "pagina": "342"
   },
   {
    "range": [
     27,
     27
    ],
    "nome": "Capa nebulosa",
    "preco": "16500",
    "livro": "Heróis de Arton",
    "pagina": "264"
   },
   {
    "range": [
     28,
     28
    ],
    "nome": "Espelho do outro lado",
    "preco": "18000",
    "livro": "Heróis de Arton",
    "pagina": "265"
   },
   {
    "range": [
     29,
     30
    ],
    "nome": "Gema da purificação",
    "preco": "18000",
    "livro": "Heróis de Arton",
    "pagina": "266"
   },
   {
    "range": [
     31,
     32
    ],
    "nome": "Máscara da raposa",
    "preco": "18000",
    "livro": "Heróis de Arton",
    "pagina": "266"
   },
   {
    "range": [
     33,
     36
    ],
    "nome": "Anel da energia",
    "preco": "21000",
    "livro": "Tormenta20",
    "pagina": "342"
   },
   {
    "range": [
     37,
     40
    ],
    "nome": "Anel da vitalidade",
    "preco": "21000",
    "livro": "Tormenta20",
    "pagina": "342"
   },
   {
    "range": [
     41,
     42
    ],
    "nome": "Anel de invisibilidade",
    "preco": "21000",
    "livro": "Tormenta20",
    "pagina": "342"
   },
   {
    "range": [
     43,
     44
    ],
    "nome": "Braçadeiras do arqueiro",
    "preco": "21000",
    "livro": "Tormenta20",
    "pagina": "342"
   },
   {
    "range": [
     45,
     46
    ],
    "nome": "Brincos de Marah",
    "preco": "21000",
    "livro": "Tormenta20",
    "pagina": "343"
   },
   {
    "range": [
     47,
     48
    ],
    "nome": "Faixas do pugilista",
    "preco": "21000",
    "livro": "Tormenta20",
    "pagina": "344"
   },
   {
    "range": [
     49,
     50
    ],
    "nome": "Manto da aranha",
    "preco": "21000",
    "livro": "Tormenta20",
    "pagina": "344"
   },
   {
    "range": [
     51,
     52
    ],
    "nome": "Vassoura voadora",
    "preco": "21000",
    "livro": "Tormenta20",
    "pagina": "345"
   },
   {
    "range": [
     53,
     54
    ],
    "nome": "Símbolo abençoado",
    "preco": "21000",
    "livro": "Tormenta20",
    "pagina": "345"
   },
   {
    "range": [
     55,
     55
    ],
    "nome": "Colar de presas",
    "preco": "21000",
    "livro": "Deuses de Arton",
    "pagina": "57"
   },
   {
    "range": [
     56,
     56
    ],
    "nome": "Vestido noturno",
    "preco": "21000",
    "livro": "Deuses de Arton",
    "pagina": "58"
   },
   {
    "range": [
     57,
     57
    ],
    "nome": "Anel da beleza ilusória",
    "preco": "21000",
    "livro": "Heróis de Arton",
    "pagina": "263"
   },
   {
    "range": [
     58,
     58
    ],
    "nome": "Bastão do sonhador",
    "preco": "21000",
    "livro": "Heróis de Arton",
    "pagina": "263"
   },
   {
    "range": [
     59,
     59
    ],
    "nome": "Colar da fúria monstruosa",
    "preco": "21000",
    "livro": "Heróis de Arton",
    "pagina": "264"
   },
   {
    "range": [
     60,
     60
    ],
    "nome": "Coroa da floresta sussurrante",
    "preco": "21000",
    "livro": "Heróis de Arton",
    "pagina": "265"
   },
   {
    "range": [
     61,
     61
    ],
    "nome": "Espelho da verdade",
    "preco": "21000",
    "livro": "Heróis de Arton",
    "pagina": "265"
   },
   {
    "range": [
     62,
     62
    ],
    "nome": "Instrumentos da celeridade",
    "preco": "22500",
    "livro": "Heróis de Arton",
    "pagina": "266"
   },
   {
    "range": [
     63,
     63
    ],
    "nome": "Máscara do predador",
    "preco": "22500",
    "livro": "Heróis de Arton",
    "pagina": "266"
   },
   {
    "range": [
     64,
     65
    ],
    "nome": "Frigideira do chef anão",
    "preco": "24000",
    "livro": "Heróis de Arton",
    "pagina": "266"
   },
   {
    "range": [
     66,
     66
    ],
    "nome": "Gema da santificação",
    "preco": "24000",
    "livro": "Heróis de Arton",
    "pagina": "266"
   },
   {
    "range": [
     67,
     67
    ],
    "nome": "Cubo armadilha",
    "preco": "25000",
    "livro": "Deuses de Arton",
    "pagina": "56"
   },
   {
    "range": [
     68,
     68
    ],
    "nome": "Caldeirão da vida",
    "preco": "25000",
    "livro": "Deuses de Arton",
    "pagina": "57"
   },
   {
    "range": [
     69,
     72
    ],
    "nome": "Amuleto da robustez",
    "preco": "25500",
    "livro": "Tormenta20",
    "pagina": "342"
   },
   {
    "range": [
     73,
     74
    ],
    "nome": "Botas velozes",
    "preco": "25500",
    "livro": "Tormenta20",
    "pagina": "342"
   },
   {
    "range": [
     75,
     78
    ],
    "nome": "Cinto da força do gigante",
    "preco": "25500",
    "livro": "Tormenta20",
    "pagina": "343"
   },
   {
    "range": [
     79,
     82
    ],
    "nome": "Coroa majestosa",
    "preco": "25500",
    "livro": "Tormenta20",
    "pagina": "344"
   },
   {
    "range": [
     83,
     86
    ],
    "nome": "Estola da serenidade",
    "preco": "25500",
    "livro": "Tormenta20",
    "pagina": "344"
   },
   {
    "range": [
     87,
     87
    ],
    "nome": "Manto do morcego",
    "preco": "25500",
    "livro": "Tormenta20",
    "pagina": "344"
   },
   {
    "range": [
     88,
     91
    ],
    "nome": "Pulseiras da celeridade",
    "preco": "25500",
    "livro": "Tormenta20",
    "pagina": "345"
   },
   {
    "range": [
     92,
     95
    ],
    "nome": "Tiara da sapiência",
    "preco": "25500",
    "livro": "Tormenta20",
    "pagina": "345"
   },
   {
    "range": [
     96,
     97
    ],
    "nome": "Argolas místicas",
    "preco": "25500",
    "livro": "Deuses de Arton",
    "pagina": "59"
   },
   {
    "range": [
     98,
     98
    ],
    "nome": "Bastão da grande harmonia",
    "preco": "25500",
    "livro": "Heróis de Arton",
    "pagina": "263"
   },
   {
    "range": [
     99,
     99
    ],
    "nome": "Coroa da majestade distorcida",
    "preco": "25500",
    "livro": "Heróis de Arton",
    "pagina": "265"
   },
   {
    "range": [
     100,
     100
    ],
    "nome": "Bracelete do coração vivaz",
    "preco": "27000",
    "livro": "Heróis de Arton",
    "pagina": "264"
   }
  ],
  "maior": [
   {
    "range": [
     1,
     2
    ],
    "nome": "Elmo do teletransporte",
    "preco": "30000",
    "livro": "Tormenta20",
    "pagina": "344"
   },
   {
    "range": [
     3,
     4
    ],
    "nome": "Gema da telepatia",
    "preco": "30000",
    "livro": "Tormenta20",
    "pagina": "344"
   },
   {
    "range": [
     5,
     6
    ],
    "nome": "Gema elemental",
    "preco": "30000",
    "livro": "Tormenta20",
    "pagina": "344"
   },
   {
    "range": [
     7,
     11
    ],
    "nome": "Manual da saúde corporal",
    "preco": "30000",
    "livro": "Tormenta20",
    "pagina": "345"
   },
   {
    "range": [
     12,
     16
    ],
    "nome": "Manual do bom exercício",
    "preco": "30000",
    "livro": "Tormenta20",
    "pagina": "345"
   },
   {
    "range": [
     17,
     21
    ],
    "nome": "Manual dos movimentos precisos",
    "preco": "30000",
    "livro": "Tormenta20",
    "pagina": "345"
   },
   {
    "range": [
     22,
     26
    ],
    "nome": "Medalhão de Lena",
    "preco": "30000",
    "livro": "Tormenta20",
    "pagina": "345"
   },
   {
    "range": [
     27,
     31
    ],
    "nome": "Tomo da compreensão",
    "preco": "30000",
    "livro": "Tormenta20",
    "pagina": "345"
   },
   {
    "range": [
     32,
     36
    ],
    "nome": "Tomo da liderança e influência",
    "preco": "30000",
    "livro": "Tormenta20",
    "pagina": "345"
   },
   {
    "range": [
     37,
     41
    ],
    "nome": "Tomo dos grandes pensamentos",
    "preco": "30000",
    "livro": "Tormenta20",
    "pagina": "345"
   },
   {
    "range": [
     42,
     44
    ],
    "nome": "Anel da chama dançante",
    "preco": "30000",
    "livro": "Heróis de Arton",
    "pagina": "263"
   },
   {
    "range": [
     45,
     46
    ],
    "nome": "Chapéu pensador",
    "preco": "30000",
    "livro": "Heróis de Arton",
    "pagina": "264"
   },
   {
    "range": [
     47,
     48
    ],
    "nome": "Cinto da flecha veloz",
    "preco": "30000",
    "livro": "Heróis de Arton",
    "pagina": "264"
   },
   {
    "range": [
     49,
     50
    ],
    "nome": "Gema da profanação",
    "preco": "30000",
    "livro": "Heróis de Arton",
    "pagina": "266"
   },
   {
    "range": [
     51,
     53
    ],
    "nome": "Tomo da técnica definitiva",
    "preco": "30000",
    "livro": "Heróis de Arton",
    "pagina": "267"
   },
   {
    "range": [
     54,
     55
    ],
    "nome": "Tapeçaria da guerra",
    "preco": "35000",
    "livro": "Deuses de Arton",
    "pagina": "55"
   },
   {
    "range": [
     56,
     57
    ],
    "nome": "Braceletes da amizade intensa",
    "preco": "36000",
    "livro": "Heróis de Arton",
    "pagina": "264"
   },
   {
    "range": [
     58,
     58
    ],
    "nome": "Cilício vivo",
    "preco": "37000",
    "livro": "Deuses de Arton",
    "pagina": "55"
   },
   {
    "range": [
     59,
     59
    ],
    "nome": "Coração corrompido",
    "preco": "45000",
    "livro": "Deuses de Arton",
    "pagina": "55"
   },
   {
    "range": [
     60,
     61
    ],
    "nome": "Coração do inverno",
    "preco": "45000",
    "livro": "Heróis de Arton",
    "pagina": "265"
   },
   {
    "range": [
     62,
     63
    ],
    "nome": "Tomo dos companheiros",
    "preco": "45000",
    "livro": "Heróis de Arton",
    "pagina": "267"
   },
   {
    "range": [
     64,
     65
    ],
    "nome": "Anel refletor",
    "preco": "51000",
    "livro": "Tormenta20",
    "pagina": "342"
   },
   {
    "range": [
     66,
     67
    ],
    "nome": "Cinto do campeão",
    "preco": "51000",
    "livro": "Tormenta20",
    "pagina": "343"
   },
   {
    "range": [
     68,
     71
    ],
    "nome": "Colar guardião",
    "preco": "51000",
    "livro": "Tormenta20",
    "pagina": "343"
   },
   {
    "range": [
     72,
     73
    ],
    "nome": "Estatueta animista",
    "preco": "51000",
    "livro": "Tormenta20",
    "pagina": "344"
   },
   {
    "range": [
     74,
     75
    ],
    "nome": "Anel da liberdade",
    "preco": "60000",
    "livro": "Tormenta20",
    "pagina": "342"
   },
   {
    "range": [
     76,
     77
    ],
    "nome": "Tapete voador",
    "preco": "60000",
    "livro": "Tormenta20",
    "pagina": "345"
   },
   {
    "range": [
     78,
     79
    ],
    "nome": "Chave dos planos",
    "preco": "60000",
    "livro": "Heróis de Arton",
    "pagina": "264"
   },
   {
    "range": [
     80,
     81
    ],
    "nome": "Cinto da desmaterialização",
    "preco": "60000",
    "livro": "Heróis de Arton",
    "pagina": "264"
   },
   {
    "range": [
     82,
     85
    ],
    "nome": "Braceletes de ouro",
    "preco": "64500",
    "livro": "Tormenta20",
    "pagina": "342"
   },
   {
    "range": [
     86,
     87
    ],
    "nome": "Espelho da oposição",
    "preco": "75000",
    "livro": "Tormenta20",
    "pagina": "344"
   },
   {
    "range": [
     88,
     91
    ],
    "nome": "Robe do arquimago",
    "preco": "90000",
    "livro": "Tormenta20",
    "pagina": "345"
   },
   {
    "range": [
     92,
     93
    ],
    "nome": "Ossos dracônicos",
    "preco": "90000",
    "livro": "Deuses de Arton",
    "pagina": "56"
   },
   {
    "range": [
     94,
     95
    ],
    "nome": "Orbe das tempestades",
    "preco": "97500",
    "livro": "Tormenta20",
    "pagina": "345"
   },
   {
    "range": [
     96,
     97
    ],
    "nome": "Braçadeiras da força do colosso",
    "preco": "120000",
    "livro": "Heróis de Arton",
    "pagina": "264"
   },
   {
    "range": [
     98,
     99
    ],
    "nome": "Anel da regeneração",
    "preco": "150000",
    "livro": "Tormenta20",
    "pagina": "342"
   },
   {
    "range": [
     100,
     100
    ],
    "nome": "Espelho do aprisionamento",
    "preco": "150000",
    "livro": "Tormenta20",
    "pagina": "344"
   }
  ]
 },
 "riquezas": [
  {
   "valor": "4d4 (10)",
   "exemplos": "0,5 espaço: ágata trincada, anel de hematita, bule de chá com gravações em prata, 1d4+1 soldadinhos de chumbo do Exército do Reinado, jarro de mel, prato de bronze, tapeçaria simples sem moldura, tinta de tecido suficiente para uma roupa;\n1 espaço: caixa com velas aromáticas, estandarte em algodão de um nobre menor, kobold de pelúcia em tamanho natural, roldana de ferro;\n2 espaços: barrilete de óleo cru, espantalho imitando um hynne nobre, rolo de algodão tecido, tela para pintura;\n5 espaços: barril de farinha ou gaiola com galinhas.",
   "menor": [
    1,
    25
   ],
   "media": null,
   "maior": null
  },
  {
   "valor": "1d4x10 (25)",
   "exemplos": "0,5 espaço: colar de presas de bulette, livreto de poesia bucaneira, quartzo rosa, topázio;\n1 espaço: ânfora de prata com símbolo de Marah (vale o dobro em um templo da deusa), caixa de tabaco, rolo de linho, urna de sais aromáticos (pode ser usada como ingrediente para preparados), saco com penas de hipossauro;\n2 espaços: conjunto de talheres de prata, jarro de especiarias, como canela, gorad, pimenta ou sal;\n5 espaços: candelabro de bronze, colchão de palha de boa qualidade;\n—: vaca leiteira (irá acompanhá-lo se você for treinado em Adestramento)",
   "menor": [
    26,
    40
   ],
   "media": null,
   "maior": null
  },
  {
   "valor": "2d4x10 (50)",
   "exemplos": "0,5 espaço: ampulheta, arreios de prata, barra de gorad, bracelete de ouro finamente trabalhado, cadeado de latão de boa qualidade, leque de bambu e seda, garrafa com água das profundezas do Mar Negro (supostamente possui propriedades mágicas);\n1 espaço: bengala de ébano com uma cabeça de serpente de marfim, estatueta de osso entalhado, frutas exóticas (estragam em 2d4 dias), lamparina de ouro (vale o dobro para um devoto de Azgher), livro de crônicas roramarianas, livro de receitas campeiras de Namalkah, molde para fabricar velas, rolo de seda\n2 espaço: brazeiro de latão decorado, cobertor para montaria, couro curtido de um burafonte, vaso de prata.",
   "menor": [
    41,
    55
   ],
   "media": [
    1,
    10
   ],
   "maior": null
  },
  {
   "valor": "4d6x10 (140)",
   "exemplos": "0,5 espaço: ametista, cartas de um nobre falecido (seus descendentes podem pagar o dobro), frasco de tinta allavir, pente de madeira Tollon, pérola branca, suspensórios elegantes;\n1 espaço: caixa com 5 pares de meias de seda, cálice de prata com gemas de lápis-lazúli, estojo com sinete e apetrechos burocráticos (vale o dobro para o proprietário original), lingote de prata, sapatilha élfica confortável, tiara sinuosa própria para uma medusa, traje de festa exclusivo (concede +2 em Diplomacia durante a primeira cena em que for usado);\n2 espaços: alvo para disparos sofisticado (treinar nele fornece +1 em Pontaria até o fim da aventura, mas o destrói), bloco de gelo das Uivantes (derrete em 1d6+3 dias), estatueta de uma cocatriz com olhos de madrepérola;\n5 espaços: tapeçaria grande e bem-feita de lã;\n20 espaços: porta de madeira maciça finamente entalhada.",
   "menor": [
    56,
    70
   ],
   "media": [
    11,
    30
   ],
   "maior": null
  },
  {
   "valor": "1d6x100 (350)",
   "exemplos": "0,5 espaço: alexandrita, pérola negra, peruca de crina de pégaso;\n1 espaço: caleidoscópio de bronze com imagens doheritas, espada cerimonial ornada com prata e gema negra no cabo, toga tapistana com barra bordada em ouro, pente de prata com pedras preciosas, roda de queijo de seiva de galhada (rende 12 fatias; cada uma recupera 1d4+1 PV), sapatos de dança em couro de serpe;\n2 espaços: relógio de parede kliren;\n5 espaços: cadeira de madeira Tollon, cavalo de balanço com crina de verdade;\n10 espaços: conjunto de velas de um galeão;\n—: carruagem (pode ser puxada por um animal de tração ou arrastada por um personagem como um item que ocupa 20 espaços).",
   "menor": [
    71,
    85
   ],
   "media": [
    31,
    50
   ],
   "maior": [
    1,
    5
   ]
  },
  {
   "valor": "2d6x100 (700)",
   "exemplos": "0,5 espaço: baralho de Wyrt com tinta de ouro, bracelete banhado em adamante, condecoração militar da Guerra Artoniana;\n1 espaço: escultura de vidro feito com areia de Halak-Tur, estatueta de Valkaria em prata azulada, pente em forma de dragão com olhos de gema vermelha, máscara teatral de marfim com pedras preciosas, réplica do machado Zakharin (portá-lo é crime no Reinado), vestido digno de uma princesa;\n2 espaços: telescópio portátil;\n5 espaços: barril de cerveja fina de Doherimm, harpa de madeira exótica com ornamentos de zircão e marfim;\n10 espaços: tronco de madeira Tollon.",
   "menor": [
    86,
    95
   ],
   "media": [
    51,
    65
   ],
   "maior": [
    6,
    15
   ]
  },
  {
   "valor": "2d8x100 (900)",
   "exemplos": "0,5 espaço: brinco com uma joia de aço-rubi, opala negra, tapa-olho com um olho falso de safira;\n1 espaço: luva bordada e adornada com gemas, pingente de opala vermelha com corrente de ouro;\n2 espaços: gaiola de prata para falcoaria, lingote de ouro, pintura antiga;\n5 espaços: barril de especiarias de Moreania;\n—: carroça cheia de mercadorias comuns (pode ser puxada por um animal de tração ou arrastada por um personagem como um item que ocupa 20 espaços).",
   "menor": [
    96,
    99
   ],
   "media": [
    66,
    80
   ],
   "maior": [
    16,
    25
   ]
  },
  {
   "valor": "4d10x100 (2.200)",
   "exemplos": "0,5 espaço: esmeralda verde, pingente de safira;\n1 espaço: caixinha de música de ouro, ovo de grifo (com tempo e cuidado, pode ser transformado em um parceiro grifo iniciante), tornozeleira com gemas;\n2 espaços: manto bordado em veludo e seda com inúmeras pedras preciosas;\n5 espaços: berço de madeira Tollon com detalhes em ouro, chafariz de mármore para fonte de jardim, conjunto de taças de cristal em caixote;\n20 espaços: coluna de mármore em estilo neogórdio.",
   "menor": [
    100,
    100
   ],
   "media": [
    81,
    90
   ],
   "maior": [
    26,
    40
   ]
  },
  {
   "valor": "6d12x100 (3.900)",
   "exemplos": "0,5 espaços: anel de prata e safira, correntinha com pequenas pérolas rosas, diamante branco, pingente de ouro com um topázio em forma de Marah;\n1 espaço: espelho feito na Pondsmânia (adiciona traços feéricos ao reflexo do usuário);\n2 espaços: miniatura mecânica de um dragão feita por um inventor renomado, tábua de granito com reprodução da Tarvica em letras de ouro, vestido digno de uma rainha;\n5 espaços: ídolo de ouro puro maciço, quadro élfico em estilo sobrenaturalista;\n100 espaços: bloco de mármore bruto.",
   "menor": null,
   "media": [
    91,
    95
   ],
   "maior": [
    41,
    60
   ]
  },
  {
   "valor": "2d10x1.000 (11.000)",
   "exemplos": "0,5 espaço: anel de ouro e rubi, diamante vermelho;\n1 espaço: tiara de mitral cravejada de rubis;\n2 espaços: conjunto de taças de ouro decoradas com esmeraldas;\n5 espaços: busto de Tanna-Toh esculpido por um artista famoso, globo de Arton com pedras preciosas marcando os pontos de interesse conhecidos;\n10 espaços: quadro do arquimago Vectorius em tamanho natural;\n20 espaços: piano em madeira Tollon com cordas de mitral e teclas de marfim de Galrasia, estátua dourada de Klunk.",
   "menor": null,
   "media": [
    96,
    99
   ],
   "maior": [
    61,
    75
   ]
  },
  {
   "valor": "6d8x1.000 (27.000)",
   "exemplos": "1 espaço: coroa de ouro adornada com centenas de gemas que pertenceu a um antigo monarca;\n2 espaço: baú de mitral com coleção de diamantes, tapeçaria da Tormenta em estilo grigoriano (observá-la fornece 1 PM temporário para devotos de Aharadak uma vez por dia);\n5 espaço: estatueta de gelo eterno com uma essência elemental agitada em seu interior;\n20 espaços: meteorito de adamante bruto, sino de catedral de ouro maciço.",
   "menor": null,
   "media": [
    100,
    100
   ],
   "maior": [
    76,
    85
   ]
  },
  {
   "valor": "1d10x10.000 (55.000)",
   "exemplos": "1 espaço: elmo de matéria vermelha com detalhes em rubis e turmalinas;\n10 espaços: altar religioso em granito e onix com inscrições em ouro, sarcófago de ouro cravejado de gemas;\n20 espaços: arca de madeira reforçada repleta de lingotes de prata e ouro e pedras preciosas de vários tipos;\n—: carruagem de luxo em madeira Tollon banhada a ouro com detalhes em metais finos e pedras preciosas (pode ser puxada por um animal de tração ou arrastada por um personagem como um item que ocupa 20 espaços).",
   "menor": null,
   "media": null,
   "maior": [
    86,
    95
   ]
  },
  {
   "valor": "4d12x10.000 (260.000)",
   "exemplos": "20 espaços: estátua titanoteica em aventurina de uma divindade do Panteão;\n—: uma sala forrada de moedas (mover todo esse dinheiro exige trabalhadores e carroças, ou outra ideia por parte dos jogadores, além de atrair a atenção de bandidos, coletores de impostos e aproveitadores de vários tipos).",
   "menor": null,
   "media": null,
   "maior": [
    96,
    100
   ]
  },
  {
   "valor": "",
   "exemplos": "",
   "menor": null,
   "media": [
    1,
    1
   ],
   "maior": null
  },
  {
   "valor": "",
   "exemplos": "",
   "menor": null,
   "media": [
    2,
    2
   ],
   "maior": null
  },
  {
   "valor": "",
   "exemplos": "",
   "menor": null,
   "media": [
    5,
    5
   ],
   "maior": null
  },
  {
   "valor": "",
   "exemplos": "",
   "menor": null,
   "media": [
    10,
    10
   ],
   "maior": null
  },
  {
   "valor": "",
   "exemplos": "",
   "menor": null,
   "media": [
    20,
    20
   ],
   "maior": null
  },
  {
   "valor": "",
   "exemplos": "",
   "menor": [
    20,
    20
   ],
   "media": [
    100,
    100
   ],
   "maior": null
  }
 ]
};
