"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { compressImageFile } from "@/lib/compress-image";
import { Button, Card, Input, Label } from "./ui";

export function NewProductForm({ typeSuggestions = [] }: { typeSuggestions?: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("");
  const [listPrice, setListPrice] = useState("");
  const [netPrice, setNetPrice] = useState("");
  const [stockOnHand, setStockOnHand] = useState("0");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!photo) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  function reset() {
    setSku("");
    setName("");
    setType("");
    setDescription("");
    setColor("");
    setListPrice("");
    setNetPrice("");
    setStockOnHand("0");
    setPhoto(null);
    setError("");
  }

  function close() {
    setOpen(false);
    reset();
  }

  async function onPickPhoto(file: File | null) {
    setError("");
    if (!file) {
      setPhoto(null);
      return;
    }
    try {
      const compressed = await compressImageFile(file);
      if (compressed.size > 700_000) {
        setError("La foto sigue muy pesada. Prueba otra más liviana.");
        setPhoto(null);
        return;
      }
      setPhoto(compressed);
    } catch {
      setError("No se pudo leer la imagen.");
      setPhoto(null);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const listNum = Number(listPrice);
    const netNum = Number(netPrice);
    const stockNum = Math.floor(Number(stockOnHand || 0));

    if (!sku.trim() || !name.trim() || !type.trim()) {
      setError("Código, nombre y tipo son obligatorios.");
      return;
    }
    if (!Number.isFinite(netNum) || netNum < 0) {
      setError("Precio de venta inválido.");
      return;
    }
    if (!Number.isFinite(listNum) || listNum < 0) {
      setError("Precio de lista inválido.");
      return;
    }
    if (!Number.isInteger(stockNum) || stockNum < 0) {
      setError("Stock inicial inválido.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const form = new FormData();
      form.set("sku", sku);
      form.set("name", name);
      form.set("type", type);
      form.set("description", description);
      form.set("color", color);
      form.set("listPrice", String(listNum));
      form.set("netPrice", String(netNum));
      form.set("stockOnHand", String(stockNum));
      if (photo) form.set("photo", photo);

      const res = await fetch("/api/inventory/products", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo crear");
        return;
      }
      close();
      router.refresh();
    } catch {
      setError("Sin conexión. Revisa el internet e intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative">
      {!open ? (
        <Button
          type="button"
          variant="gold"
          className="px-3 py-2 text-xs"
          onClick={() => setOpen(true)}
        >
          Nuevo producto
        </Button>
      ) : (
        <div className="fixed inset-x-0 bottom-0 top-0 z-40 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
          <Card className="max-h-[90vh] w-full max-w-lg overflow-y-auto">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <h2 className="font-semibold text-ink">Nuevo producto</h2>
                <p className="text-xs text-muted">
                  Solo administración. Puedes agregar foto.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                className="px-2 py-1 text-xs"
                onClick={close}
              >
                Cerrar
              </Button>
            </div>

            <form onSubmit={submit} className="space-y-3">
              <div>
                <Label htmlFor="np-photo">Foto</Label>
                <div className="flex items-center gap-3">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-border/30">
                    {preview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={preview}
                        alt="Vista previa"
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <span className="px-1 text-center text-[10px] text-muted">Sin foto</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <Input
                      id="np-photo"
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/*"
                      onChange={(e) => onPickPhoto(e.target.files?.[0] || null)}
                    />
                    {photo ? (
                      <button
                        type="button"
                        className="text-xs font-semibold text-danger"
                        onClick={() => setPhoto(null)}
                      >
                        Quitar foto
                      </button>
                    ) : (
                      <p className="text-xs text-muted">
                        Galería o cámara. JPG, PNG o WebP. Opcional.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="np-sku">Código</Label>
                  <Input
                    id="np-sku"
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    placeholder="KN-123"
                    required
                    autoComplete="off"
                  />
                </div>
                <div>
                  <Label htmlFor="np-type">Tipo</Label>
                  <Input
                    id="np-type"
                    list="np-type-options"
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    placeholder="ESTUFA"
                    required
                    autoComplete="off"
                  />
                  <datalist id="np-type-options">
                    {typeSuggestions.map((t) => (
                      <option key={t} value={t} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div>
                <Label htmlFor="np-name">Nombre</Label>
                <Input
                  id="np-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder='Estufa 30" Satinada'
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="np-desc">Descripción</Label>
                  <Input
                    id="np-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder='Tamaño 30"'
                  />
                </div>
                <div>
                  <Label htmlFor="np-color">Color</Label>
                  <Input
                    id="np-color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    placeholder="SATINADA"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label htmlFor="np-list">Precio lista</Label>
                  <Input
                    id="np-list"
                    type="number"
                    min={0}
                    step="0.01"
                    value={listPrice}
                    onChange={(e) => setListPrice(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="np-net">Precio venta</Label>
                  <Input
                    id="np-net"
                    type="number"
                    min={0}
                    step="0.01"
                    value={netPrice}
                    onChange={(e) => setNetPrice(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="np-stock">Stock inicial</Label>
                  <Input
                    id="np-stock"
                    type="number"
                    min={0}
                    step={1}
                    value={stockOnHand}
                    onChange={(e) => setStockOnHand(e.target.value)}
                  />
                </div>
              </div>

              {error ? <p className="text-sm text-danger">{error}</p> : null}

              <Button type="submit" loading={loading} className="w-full">
                Crear producto
              </Button>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
