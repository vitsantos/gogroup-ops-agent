import json
from pathlib import Path
import numpy as np
import pandas as pd

# 1. Caminhos dos arquivos
DATA_DIR = Path("data")
OUTPUT_PATH = Path("src/data/dados_processados.json")
OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)

pedidos = pd.read_csv(DATA_DIR / "pedidos_excecao.csv")
clientes = pd.read_csv(DATA_DIR / "clientes.csv")
transp = pd.read_csv(DATA_DIR / "transportadoras.csv")

# 2. Merge relacional
df = pedidos.merge(clientes, on="customer_id", how="left")
df = df.merge(
    transp,
    left_on=["transportadora", "uf"],
    right_on=["transportadora", "uf_atendida"],
    how="left",
)

# 3. Parâmetros de negócio (parametros.md)
FERIADOS = np.array(["2026-09-07", "2026-10-12"], dtype="datetime64[D]")
CAPACIDADE_DIARIA = 150
CMV_PCT = 0.24
CUSTO_CONTATO = 9.00

df["data_pedido_dt"] = pd.to_datetime(df["data_pedido"])
df["data_prometida_dt"] = pd.to_datetime(df["data_prometida"])
df["data_entrega_dt"] = pd.to_datetime(df["data_entrega"])
df["data_abertura_dt"] = pd.to_datetime(df["data_abertura_excecao"])


# 4. Cálculo do prazo correto em dias úteis (1 dia útil separação + SLA contratado)
def calc_prazo_correto(d_series, sla_series):
    res = []
    for d, sla in zip(d_series, sla_series):
        if pd.isna(d) or pd.isna(sla):
            res.append(pd.NaT)
            continue
        next_day = np.datetime64(d, "D") + np.timedelta64(1, "D")
        dia_1 = np.busday_offset(next_day, 0, roll="forward", holidays=FERIADOS)
        prometida = np.busday_offset(dia_1, int(sla), roll="forward", holidays=FERIADOS)
        res.append(prometida)
    return pd.to_datetime(res)


df["data_prometida_correta_dt"] = calc_prazo_correto(
    df["data_pedido_dt"], df["sla_contratado_dias_uteis"]
)
df["erro_checkout_dias"] = (
    df["data_prometida_correta_dt"] - df["data_prometida_dt"]
).dt.days


def calc_dias_uteis_atraso(ref_series, prom_series):
    res = []
    for ref, prom in zip(ref_series, prom_series):
        if pd.isna(ref) or pd.isna(prom):
            res.append(0)
            continue
        r_np = np.datetime64(ref, "D")
        p_np = np.datetime64(prom, "D")
        if r_np <= p_np:
            res.append(0)
        else:
            res.append(int(np.busday_count(p_np, r_np, holidays=FERIADOS)))
    return pd.Series(res, index=ref_series.index)


data_efetiva_ou_ref = df["data_entrega_dt"].fillna(pd.Timestamp("2026-09-30"))
df["dias_uteis_atraso_real"] = calc_dias_uteis_atraso(
    data_efetiva_ou_ref, df["data_prometida_correta_dt"]
)
df["falso_atraso"] = (df["tipo_excecao"] == "atraso_entrega") & (
    df["dias_uteis_atraso_real"] == 0
)
df["is_duplicado"] = df.duplicated(subset=["order_id"], keep="first")


# 5. Probabilidade de cancelamento / perda conforme parametros.md
def prob_cancelamento_atraso(dias_atraso):
    if dias_atraso <= 0:
        return 0.0
    elif dias_atraso <= 2:
        return 0.04
    elif dias_atraso <= 5:
        return 0.10
    elif dias_atraso <= 10:
        return 0.22
    return 0.40


def prob_risco_excecao(row):
    tipo = row["tipo_excecao"]
    if row["falso_atraso"]:
        return 0.02
    if tipo == "atraso_entrega":
        return prob_cancelamento_atraso(row["dias_uteis_atraso_real"])
    elif tipo in ["extravio", "ruptura_pos_venda"]:
        return 0.85
    elif tipo in ["avaria_transporte", "vazamento_produto", "falha_personalizacao"]:
        return 0.65
    elif tipo in ["devolvido_transportadora", "rastreio_parado", "item_faltante"]:
        return 0.45
    elif tipo in ["endereco_divergente", "pagamento_pendente"]:
        return 0.30
    return 0.25


df["prob_perda"] = df.apply(prob_risco_excecao, axis=1)

# 6. Custos unitários e LTV em risco
df["custo_cmv"] = (df["valor"] * CMV_PCT).round(2)
df["custo_reenvio"] = (df["custo_cmv"] + df["custo_medio_frete"].fillna(0)).round(2)
df["custo_reembolso"] = df["valor"].round(2)
df["economia_reenvio"] = (df["custo_reembolso"] - df["custo_reenvio"]).round(2)

df["is_vip"] = df["receita_acumulada"] > 1500
df["ticket_medio_cliente"] = (
    df["receita_acumulada"] / df["n_pedidos"].clip(lower=1)
).round(2)
df["perda_ltv_12m"] = np.where(
    df["is_vip"],
    df["ticket_medio_cliente"] * 0.35,
    df["ticket_medio_cliente"] * 0.14,
).round(2)

df["exposicao_financeira"] = (df["valor"] + df["perda_ltv_12m"]).round(2)
df["risco_financeiro_esperado"] = np.where(
    df["is_duplicado"],
    0.0,
    (
        df["prob_perda"] * df["exposicao_financeira"]
        + (df["n_contatos_atendimento"].fillna(0) * 3.0)
    ).round(2),
)


# 7. Causa raiz sistêmica
def diagnosticar_causa_raiz(row):
    if row["is_duplicado"]:
        return "Ticket Duplicado (Mesmo Pedido)"
    if row["falso_atraso"]:
        return "Bug Checkout (Prazo em Dias Corridos)"
    if row["tipo_excecao"] == "falha_personalizacao" and row["maquina"] == "IMP-02":
        return "Falha Máquina IMP-02 (CD1)"
    if (
        row["tipo_excecao"] == "item_faltante"
        and row["cd"] == "CD2"
        and row["turno"] == "noite"
    ):
        return "Omissão Conferência/Brinde (CD2 Noite)"
    if row["tipo_excecao"] == "vazamento_produto" and row["lote_produto"] == "L2607-B":
        return "Defeito Envase Lote L2607-B (Ápice)"
    if (
        row["tipo_excecao"] in ["atraso_entrega", "rastreio_parado"]
        and row["transportadora"] == "Rota Express"
    ):
        return "Gargalo Logístico Rota Express"
    if (
        row["tipo_excecao"] == "avaria_transporte"
        and row["transportadora"] == "Carga Norte"
    ):
        return "Avaria Manuseio Carga Norte"
    return "Exceção Pontual / Caso a Caso"


df["causa_raiz"] = df.apply(diagnosticar_causa_raiz, axis=1)

# 8. Ordenação da fila inteligente
df_sorted = df.sort_values(
    by=["is_duplicado", "falso_atraso", "risco_financeiro_esperado", "valor"],
    ascending=[True, True, False, False],
).reset_index(drop=True)

df_sorted["rank_prioridade"] = df_sorted.index + 1
df_sorted["acao_hoje_top150"] = (
    (df_sorted["rank_prioridade"] <= CAPACIDADE_DIARIA)
    & (~df_sorted["is_duplicado"])
    & (~df_sorted["falso_atraso"])
)

# 9. Métricas agregadas para o painel executivo
fifo_top150 = df_sorted.sort_values(["data_abertura_dt", "order_id"]).head(150)
prio_top150 = df_sorted.head(150)

causas_resumo = (
    df_sorted.groupby("causa_raiz")
    .agg(
        qtd=("order_id", "count"),
        valor_pedidos=("valor", "sum"),
        risco_esperado=("risco_financeiro_esperado", "sum"),
    )
    .sort_values("qtd", ascending=False)
    .reset_index()
    .to_dict(orient="records")
)

resumo = {
    "total_registros": int(len(df_sorted)),
    "pedidos_unicos": int(df_sorted["order_id"].nunique()),
    "duplicados_eliminados": int(df_sorted["is_duplicado"].sum()),
    "falsos_atrasos_auto": int(df_sorted["falso_atraso"].sum()),
    "valor_total_pedidos": round(
        float(df_sorted[~df_sorted["is_duplicado"]]["valor"].sum()), 2
    ),
    "exposicao_financeira_total": round(
        float(df_sorted[~df_sorted["is_duplicado"]]["exposicao_financeira"].sum()), 2
    ),
    "risco_esperado_total": round(
        float(df_sorted["risco_financeiro_esperado"].sum()), 2
    ),
    "risco_coberto_top150": round(
        float(prio_top150["risco_financeiro_esperado"].sum()), 2
    ),
    "risco_coberto_fifo": round(
        float(fifo_top150["risco_financeiro_esperado"].sum()), 2
    ),
    "ganho_vs_fifo_brl": round(
        float(
            prio_top150["risco_financeiro_esperado"].sum()
            - fifo_top150["risco_financeiro_esperado"].sum()
        ),
        2,
    ),
    "vips_top150": int(prio_top150["is_vip"].sum()),
    "vips_totais": int(df_sorted[~df_sorted["is_duplicado"]]["is_vip"].sum()),
    "causas_raiz": causas_resumo,
}

# Converter colunas para serialização JSON limpa
cols_export = [
    "rank_prioridade",
    "order_id",
    "customer_id",
    "marca",
    "data_pedido",
    "valor",
    "sku",
    "descricao_produto",
    "qtd_itens",
    "brinde_no_pedido",
    "tipo_excecao",
    "status",
    "transportadora",
    "uf",
    "cidade",
    "data_prometida",
    "data_entrega",
    "maquina",
    "turno",
    "cd",
    "lote_produto",
    "data_abertura_excecao",
    "n_pedidos",
    "receita_acumulada",
    "n_contatos_atendimento",
    "sla_contratado_dias_uteis",
    "custo_medio_frete",
    "erro_checkout_dias",
    "dias_uteis_atraso_real",
    "falso_atraso",
    "is_duplicado",
    "prob_perda",
    "custo_reenvio",
    "custo_reembolso",
    "economia_reenvio",
    "is_vip",
    "perda_ltv_12m",
    "exposicao_financeira",
    "risco_financeiro_esperado",
    "causa_raiz",
    "acao_hoje_top150",
]

export_df = df_sorted[cols_export].copy()
export_df["data_prometida_correta"] = df_sorted[
    "data_prometida_correta_dt"
].dt.strftime("%Y-%m-%d")
export_df = export_df.replace({np.nan: None})

payload = {
    "resumo": resumo,
    "pedidos": export_df.to_dict(orient="records"),
}

with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
    json.dump(payload, f, ensure_ascii=False, indent=2)

print(f"Sucesso! Arquivo gerado em {OUTPUT_PATH} com {len(export_df)} registros.")