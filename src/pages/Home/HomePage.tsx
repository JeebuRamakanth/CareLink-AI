import { Container } from '../../components/ui/Container';
import { BloodDonation } from './components/BloodDonation';
import { CTA } from './components/CTA';
import { Doctors } from './components/Doctors';
import { Emergency } from './components/Emergency';
import { Features } from './components/Features';
import { Hero } from './components/Hero';
import { Hospitals } from './components/Hospitals';
import { HowItWorks } from './components/HowItWorks';
import { Stats } from './components/Stats';
import { Testimonials } from './components/Testimonials';

export function HomePage() {
  return (
    <Container className="py-8 sm:py-10 lg:py-12">
      <div className="space-y-8 sm:space-y-10 lg:space-y-14">
        <Hero />
        <Stats />
        <Features />
        <HowItWorks />
        <Emergency />
        <BloodDonation />
        <Hospitals />
        <Doctors />
        <Testimonials />
        <CTA />
      </div>
    </Container>
  );
}
