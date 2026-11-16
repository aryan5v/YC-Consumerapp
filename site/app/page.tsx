import Beam from "@/components/templates/notio/beam";
import Hero from "@/components/templates/notio/call-to-action/hero";
import Footer from "@/components/templates/notio/footer";
import Navbar from "@/components/templates/notio/navbar";
import Screenshots from "@/components/templates/notio/screenshots";
import Technology from "@/components/templates/notio/technology";

export default function Page() {
    return (
        <div className="relative flex flex-col gap-8 overflow-hidden p-3 md:p-2">
            <Navbar />
            <Hero />
            <Beam>
                <Screenshots />
            </Beam>
            <Technology />
            <Footer />
        </div>
    );
}
