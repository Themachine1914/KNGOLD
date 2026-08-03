package pricing

import "math"

const ITBISRate = 0.18

type Totals struct {
	Subtotal    float64 `json:"subtotal"`
	ITBISAmount float64 `json:"itbisAmount"`
	Total       float64 `json:"total"`
}

func CalcQuoteTotals(lineTotals []float64, includeITBIS bool) Totals {
	var sub float64
	for _, v := range lineTotals {
		sub += v
	}
	sub = Round2(sub)
	itbis := 0.0
	if includeITBIS {
		itbis = Round2(sub * ITBISRate)
	}
	return Totals{
		Subtotal:    sub,
		ITBISAmount: itbis,
		Total:       Round2(sub + itbis),
	}
}

func Round2(n float64) float64 {
	return math.Round((n+1e-9)*100) / 100
}

func FormatRD(amount float64) string {
	neg := amount < 0
	if neg {
		amount = -amount
	}
	intPart := int64(amount)
	frac := int64(math.Round((amount-float64(intPart))*100))
	if frac == 100 {
		intPart++
		frac = 0
	}
	s := formatIntWithCommas(intPart) + "." + pad2(frac)
	if neg {
		return "-RD$" + s
	}
	return "RD$" + s
}

func formatIntWithCommas(n int64) string {
	if n < 1000 {
		return itoa(n)
	}
	return formatIntWithCommas(n/1000) + "," + pad3(n%1000)
}

func itoa(n int64) string {
	if n == 0 {
		return "0"
	}
	var b [20]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	return string(b[i:])
}

func pad2(n int64) string {
	if n < 10 {
		return "0" + itoa(n)
	}
	return itoa(n)
}

func pad3(n int64) string {
	if n < 10 {
		return "00" + itoa(n)
	}
	if n < 100 {
		return "0" + itoa(n)
	}
	return itoa(n)
}
