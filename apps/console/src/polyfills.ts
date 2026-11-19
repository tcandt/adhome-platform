// Polyfills for modern ECMAScript features required by pdfjs-dist 6.x and modern libraries on mobile browsers (iOS Safari, older Chromium)
export function installPolyfills() {
  if (typeof Uint8Array !== 'undefined') {
    const proto = Uint8Array.prototype as any;
    if (!proto.toHex) {
      proto.toHex = function () {
        let out = '';
        for (let i = 0; i < this.length; i++) {
          out += this[i].toString(16).padStart(2, '0');
        }
        return out;
      };
    }
    const ctor = Uint8Array as any;
    if (!ctor.fromHex) {
      ctor.fromHex = function (hex: string) {
        const clean = hex.replace(/[^0-9a-fA-F]/g, '');
        const bytes = new Uint8Array(Math.floor(clean.length / 2));
        for (let i = 0; i < clean.length; i += 2) {
          bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16);
        }
        return bytes;
      };
    }
  }

  const promiseCtor = Promise as any;
  if (typeof promiseCtor.withResolvers === 'undefined') {
    promiseCtor.withResolvers = function <T>() {
      let resolve!: (value: T | PromiseLike<T>) => void;
      let reject!: (reason?: any) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    };
  }

  const urlCtor = URL as any;
  if (typeof urlCtor !== 'undefined' && !urlCtor.parse) {
    urlCtor.parse = function (url: string | URL, base?: string | URL) {
      try {
        return new URL(url, base);
      } catch {
        return null;
      }
    };
  }

  const mathObj = Math as any;
  if (typeof mathObj.sumPrecise === 'undefined') {
    mathObj.sumPrecise = function (items: Iterable<number>) {
      let sum = 0;
      for (const n of items) {
        sum += Number(n) || 0;
      }
      return sum;
    };
  }
}

installPolyfills();
