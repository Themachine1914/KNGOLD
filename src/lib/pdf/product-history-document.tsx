import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { COMPANY } from "@/lib/constants";
import { productDisplayName } from "@/lib/product-label";
import { formatRD } from "@/lib/pricing";

export type ProductHistoryPdfIncoming = {
  number: number;
  supplier: string | null;
  eta: string;
  qty: number;
  reservedOnArrival: number;
  freeOnArrival: number;
};

export type ProductHistoryPdfData = {
  generatedAt: Date;
  sku: string;
  name: string;
  type: string;
  description?: string | null;
  color?: string | null;
  netPrice: number;
  registeredStock: number;
  registeredAt: string | null;
  stockOnHand: number;
  reservedWarehouse: number;
  availableWarehouse: number;
  inTransit: number;
  transitApartado: number;
  availableTransit: number;
  reservedTotal: number;
  soldQty: number;
  incoming: ProductHistoryPdfIncoming[];
};

const GOLD = "#9a7a2f";
const INK = "#151311";
const MUTED = "#6b645b";
const LINE = "#e4ddd2";
const CREAM = "#f6f3ec";

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingHorizontal: 32,
    paddingBottom: 48,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: INK,
  },
  brand: { fontSize: 18, marginBottom: 2 },
  gold: { color: GOLD },
  muted: { color: MUTED, marginBottom: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  title: { fontSize: 12, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  productName: { fontSize: 12, fontFamily: "Helvetica-Bold", marginBottom: 1 },
  kpis: { flexDirection: "row", marginTop: 8, marginBottom: 10 },
  kpi: {
    flex: 1,
    borderWidth: 1,
    borderColor: LINE,
    backgroundColor: CREAM,
    padding: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  kpiLast: {
    flex: 1,
    borderWidth: 1,
    borderColor: LINE,
    backgroundColor: CREAM,
    padding: 8,
    borderRadius: 4,
  },
  kpiLabel: { fontSize: 8, color: MUTED, marginBottom: 3, textTransform: "uppercase" },
  kpiValue: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  kpiHint: { fontSize: 8, color: MUTED, marginTop: 2 },
  section: { marginTop: 8, marginBottom: 2 },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: CREAM,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
    fontFamily: "Helvetica-Bold",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: LINE,
  },
  colConcept: { width: "72%" },
  colQty: { width: "28%", textAlign: "right" },
  note: {
    marginTop: 10,
    padding: 8,
    backgroundColor: CREAM,
    borderWidth: 1,
    borderColor: LINE,
    lineHeight: 1.35,
  },
  footer: {
    position: "absolute",
    bottom: 22,
    left: 32,
    right: 32,
    color: MUTED,
    fontSize: 8,
  },
});

function fmtDate(d: Date) {
  return d.toLocaleString("es-DO", {
    dateStyle: "long",
    timeStyle: "short",
  });
}

function Row({ concept, qty, strong }: { concept: string; qty: number; strong?: boolean }) {
  return (
    <View style={styles.tableRow}>
      <Text style={[styles.colConcept, strong ? { fontFamily: "Helvetica-Bold" } : {}]}>
        {concept}
      </Text>
      <Text style={[styles.colQty, strong ? { fontFamily: "Helvetica-Bold" } : {}]}>
        {qty} UND
      </Text>
    </View>
  );
}

export function ProductHistoryDocument({ data }: { data: ProductHistoryPdfData }) {
  const name = productDisplayName(data.name);
  const specs = [data.description, data.color].filter(Boolean).join(" · ");
  const physicalAfter = data.stockOnHand + data.inTransit;
  const reservedAfter = data.reservedTotal;
  const availableAfter = data.availableWarehouse + data.availableTransit;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>
              KN <Text style={styles.gold}>GOLD</Text>
            </Text>
            <Text style={styles.muted}>
              {COMPANY.legalName} · RNC {COMPANY.rnc}
            </Text>
            <Text style={styles.muted}>{COMPANY.address}</Text>
            <Text style={styles.muted}>
              {COMPANY.phone} · {COMPANY.website}
            </Text>
          </View>
          <View>
            <Text style={styles.title}>Resumen de inventario</Text>
            <Text style={styles.muted}>{fmtDate(data.generatedAt)}</Text>
            <Text style={styles.muted}>Documento interno</Text>
          </View>
        </View>

        <Text style={{ fontSize: 9, color: GOLD, marginBottom: 2 }}>
          {data.type} · {data.sku}
        </Text>
        <Text style={styles.productName}>{name}</Text>
        {specs ? <Text style={styles.muted}>{specs}</Text> : null}
        <Text style={{ marginTop: 2, fontFamily: "Helvetica-Bold" }}>
          {formatRD(data.netPrice)}
        </Text>

        <View style={styles.kpis}>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>Al registrar</Text>
            <Text style={styles.kpiValue}>{data.registeredStock}</Text>
            <Text style={styles.kpiHint}>Físico inicial</Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>En tránsito</Text>
            <Text style={[styles.kpiValue, { color: GOLD }]}>{data.inTransit}</Text>
            <Text style={styles.kpiHint}>{data.transitApartado} ya apartadas</Text>
          </View>
          <View style={styles.kpiLast}>
            <Text style={styles.kpiLabel}>Reservadas</Text>
            <Text style={[styles.kpiValue, { color: GOLD }]}>{data.reservedTotal}</Text>
            <Text style={styles.kpiHint}>
              {data.reservedWarehouse} almacén + {data.transitApartado} tránsito
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.title}>Estado actual</Text>
          <View style={styles.tableHeader}>
            <Text style={styles.colConcept}>Concepto</Text>
            <Text style={styles.colQty}>Cantidad</Text>
          </View>
          <Row concept="Físico en almacén hoy" qty={data.stockOnHand} />
          <Row concept="Reservado de almacén" qty={data.reservedWarehouse} />
          <Row concept="Disponible en almacén" qty={data.availableWarehouse} />
          <Row concept="En tránsito (importación abierta)" qty={data.inTransit} />
          <Row concept="Apartadas de lo que viene (despacho al llegar)" qty={data.transitApartado} />
          <Row concept="Tránsito libre para vender" qty={data.availableTransit} />
          <Row concept="Reservadas en total" qty={data.reservedTotal} strong />
          <Row
            concept="Disponible total hoy"
            qty={data.availableWarehouse + data.availableTransit}
            strong
          />
        </View>

        {data.inTransit > 0 ? (
          <View style={styles.section}>
            <Text style={styles.title}>Cuando llegue, para despachar</Text>
            <View style={styles.tableHeader}>
              <Text style={styles.colConcept}>Concepto</Text>
              <Text style={styles.colQty}>Cantidad</Text>
            </View>
            <Row
              concept="UND que se despachan a pedidos ya apartados"
              qty={data.transitApartado}
            />
            <Row concept="UND que llegan libres para vender" qty={data.availableTransit} strong />
            <Text style={{ marginTop: 6, color: MUTED, fontSize: 9 }}>
              Al recibir el lote: físico {physicalAfter} · reservado {reservedAfter} ·
              disponible {availableAfter}.
            </Text>
          </View>
        ) : null}

        {data.incoming.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.title}>Importaciones en camino</Text>
            {data.incoming.map((lot, i) => (
              <Text key={i} style={{ marginBottom: 3 }}>
                {lot.number ? `Pedido #${lot.number}` : "Lote en tránsito"}
                {lot.supplier ? ` · ${lot.supplier}` : ""}
                {lot.eta ? ` · ETA ${lot.eta}` : ""}
                {`: ${lot.qty} UND (${lot.reservedOnArrival} apartadas / ${lot.freeOnArrival} libres)`}
              </Text>
            ))}
          </View>
        ) : null}

        <View style={styles.note}>
          <Text>
            Al dar de alta había {data.registeredStock} UND. Hoy el físico es {data.stockOnHand}
            {data.soldQty > 0 ? ` · vendidas ${data.soldQty} UND` : ""}.
            {data.inTransit > 0
              ? ` En tránsito van ${data.inTransit} UND (${data.transitApartado} ya reservadas para despachar + ${data.availableTransit} libres).`
              : " No hay importación abierta."}{" "}
            Las {data.reservedWarehouse} UND de almacén siguen reservadas hasta facturar o anular
            esos pedidos.
          </Text>
        </View>

        <Text style={styles.footer}>
          Documento interno de inventario KN GOLD. No constituye e-NCF ni comprobante fiscal
          DGII. Generado el {fmtDate(data.generatedAt)}.
        </Text>
      </Page>
    </Document>
  );
}
