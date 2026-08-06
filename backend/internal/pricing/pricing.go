package pricing

const ITBISRate = 0.18

type Totals struct {
	Subtotal    float64 `json:"subtotal"`
	ITBISAmount float64 `json:"itbisAmount"`
	Total       float64 `json:"total"`
}

// CalcQuoteTotals keeps the same total with or without comprobante.
// When includeITBIS is true, ITBIS 18% is extracted for display only.
func CalcQuoteTotals(lineTotals []float64, includeITBIS bool) Totals {
	var sum float64
	for _, v := range lineTotals {
		sum += v
	}
	total := Round2(sum)
	if !includeITBIS {
		return Totals{Subtotal: total, ITBISAmount: 0, Total: total}
	}
	itbis := Round2(total * ITBISRate / (1 + ITBISRate))
	sub := Round2(total - itbis)
	return Totals{Subtotal: sub, ITBISAmount: itbis, Total: total}
}

func Round2(n float64) float64 {
	return float64(int(n*100+0.5)) / 100
}
