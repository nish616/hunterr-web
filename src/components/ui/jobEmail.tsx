import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";


type Job = {
  title: string;
  company: string;
  location: string;
  postedAt: string;
};

export function JobAlertEmail({
  jobs,
}: {
  jobs: Job[];
}) {
  return (
    <Html>
      <Head />
      <Preview>
        {`${jobs.length}`} new jobs match your preferences
      </Preview>

      <Body>
        <Container>
          <Heading>
            New Jobs Found 🎯
          </Heading>

          <Text>
            We found {jobs.length} new jobs matching
            your preferences.
          </Text>

          {jobs.map((job, index) => (
            <Section key={index}>
              <Text>
                <strong>{job.title}</strong>
              </Text>

              <Text>
                {job.company}
              </Text>

              <Text>
                {job.location}
              </Text>

              <Text>
                Posted:{" "}
                {new Date(
                  job.postedAt
                ).toLocaleDateString()}
              </Text>

              <hr />
            </Section>
          ))}
        </Container>
      </Body>
    </Html>
  );
}