import "@/styles/globals.css";
import "@radix-ui/themes/styles.css";
import type { AppProps } from "next/app";
import { Theme } from "@radix-ui/themes";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <Theme
      accentColor="iris"
      grayColor="slate"
      radius="large"
      appearance="dark"
    >
      <Component {...pageProps} />
    </Theme>
  );
}
