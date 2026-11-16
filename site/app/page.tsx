import Beam from "@/components/templates/notio/beam";
import Hero from "@/components/templates/notio/call-to-action/hero";
import Features from "@/components/templates/notio/features/features";
import Footer from "@/components/templates/notio/footer";
import Navbar from "@/components/templates/notio/navbar";
import Stats from "@/components/templates/notio/stats";

export default function Page() {
    return (
        <div className="relative flex flex-col gap-8 overflow-hidden p-3 md:p-2">
            <Navbar />
            <Hero />
            <Beam>
                <Features />
            </Beam>
            <Stats />
            <Footer />
        </div>
    );
}
