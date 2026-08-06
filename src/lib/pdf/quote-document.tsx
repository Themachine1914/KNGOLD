import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { COMPANY } from "@/lib/constants";
import { formatRD } from "@/lib/pricing";

type QuotePdfData = {
  number: number;
  includeItbis: boolean;
  subtotal: number;
  itbisAmount: number;
  total: number;
  createdAt: Date;
  reservedUntil: Date | null;
  status: string;
  customer: {
    name: string;
    rnc: string | null;
    phone: string | null;
    address: string | null;
  };
  seller: { name: string };
  lines: {
    qty: number;
    transitQty?: number;
    unitPrice: number;
    lineTotal: number;
    product: { sku: string; name: string };
  }[];
};

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#151311",
  },
  brand: { fontSize: 22, marginBottom: 2 },
  muted: { color: "#6b645b", marginBottom: 2 },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  section: { marginTop: 16, marginBottom: 8 },
  title: { fontSize: 14, marginBottom: 8 },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e4ddd2",
    paddingBottom: 4,
    marginBottom: 4,
    fontWeight: "bold",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee7db",
  },
  colSku: { width: "18%" },
  colName: { width: "42%" },
  colQty: { width: "10%", textAlign: "right" },
  colPrice: { width: "15%", textAlign: "right" },
  colTotal: { width: "15%", textAlign: "right" },
  totals: { marginTop: 16, alignItems: "flex-end" },
  totalLine: { width: 200, flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  itbisLine: {
    width: 200,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 3,
    color: "#c4beb4",
  },
  totalStrong: {
    width: 200,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
    fontSize: 12,
    fontWeight: "bold",
  },
  footer: { position: "absolute", bottom: 28, left: 36, right: 36, color: "#6b645b", fontSize: 8 },
});

export function QuoteDocument({ quote }: { quote: QuotePdfData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.row}>
          <View>
            <Text style={styles.brand}>{COMPANY.brand}</Text>
            <Text style={styles.muted}>{COMPANY.legalName}</Text>
            <Text style={styles.muted}>RNC {COMPANY.rnc}</Text>
            <Text style={styles.muted}>{COMPANY.address}</Text>
            <Text style={styles.muted}>
              {COMPANY.phone} · {COMPANY.website}
            </Text>
          </View>
          <View>
            <Text style={styles.title}>Cotización #{quote.number}</Text>
            <Text style={styles.muted}>
              Fecha: {new Date(quote.createdAt).toLocaleString("es-DO")}
            </Text>
            <Text style={styles.muted}>
              {quote.includeItbis ? "Con comprobante" : "Sin comprobante"}
            </Text>
            <Text style={styles.muted}>Vendedor: {quote.seller.name}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.title}>Cliente</Text>
          <Text>{quote.customer.name}</Text>
          {quote.customer.rnc ? <Text style={styles.muted}>RNC {quote.customer.rnc}</Text> : null}
          {quote.customer.phone ? (
            <Text style={styles.muted}>Tel {quote.customer.phone}</Text>
          ) : null}
          {quote.customer.address ? (
            <Text style={styles.muted}>{quote.customer.address}</Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <View style={styles.tableHeader}>
            <Text style={styles.colSku}>SKU</Text>
            <Text style={styles.colName}>Producto</Text>
            <Text style={styles.colQty}>Cant.</Text>
            <Text style={styles.colPrice}>Precio</Text>
            <Text style={styles.colTotal}>Total</Text>
          </View>
          {quote.lines.map((line, idx) => (
            <View key={idx} style={styles.tableRow}>
              <Text style={styles.colSku}>{line.product.sku}</Text>
              <Text style={styles.colName}>
                {line.product.name}
                {(line.transitQty || 0) > 0
                  ? ` (${line.transitQty} en tránsito)`
                  : ""}
              </Text>
              <Text style={styles.colQty}>{line.qty}</Text>
              <Text style={styles.colPrice}>{formatRD(line.unitPrice)}</Text>
              <Text style={styles.colTotal}>{formatRD(line.lineTotal)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totals}>
          <View style={styles.totalLine}>
            <Text>Subtotal</Text>
            <Text>{formatRD(quote.subtotal)}</Text>
          </View>
          {quote.includeItbis ? (
            <View style={styles.itbisLine}>
              <Text>ITBIS (18%)</Text>
              <Text>{formatRD(quote.itbisAmount)}</Text>
            </View>
          ) : null}
          <View style={styles.totalStrong}>
            <Text>Total</Text>
            <Text>{formatRD(quote.total)}</Text>
          </View>
        </View>

        <Text style={styles.footer}>
          Documento interno de cotización KN GOLD. No constituye e-NCF ni comprobante fiscal
          DGII. Validez de reserva sujeta a confirmación
          {quote.reservedUntil
            ? ` (hasta ${new Date(quote.reservedUntil).toLocaleString("es-DO")})`
            : ""}
          .
        </Text>
      </Page>
    </Document>
  );
}
