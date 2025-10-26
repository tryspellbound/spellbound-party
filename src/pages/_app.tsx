import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { Theme } from "@radix-ui/themes";
import { Luxurious_Roman, Poiret_One } from "next/font/google";

const luxuriousRoman = Luxurious_Roman({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-luxurious-roman",
  display: "swap",
});

const poiretOne = Poiret_One({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-poiret-one",
  display: "swap",
});

export default function App({ Component, pageProps }: AppProps) {
  return (
    <Theme
      accentColor="iris"
      grayColor="slate"
      radius="large"
      appearance="dark"
      className={`${luxuriousRoman.variable} ${poiretOne.variable}`}
    >
      <Component {...pageProps} />
    </Theme>
  );
}
