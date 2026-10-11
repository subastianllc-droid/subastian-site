import { redirect } from "next/navigation";

// The marketing site lives at subastian.us; this app only serves signed-in product pages.
export default function Home() {
  redirect("/app");
}
