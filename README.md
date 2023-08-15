# Welcome to your CDK TypeScript project

This is Web Server project where below component configured by using CDK typescript code.

1. Create 2 EC2 in different availability zones
2. Create application load balancer
3. Configure ACM SSL certificate into Load Balancer
4. Port forwarding HTTP to HTTPS in load balancer
5. Domain mapping
6. Security group with particular inbound rules
7. User data script to install nginx server on EC2

# Architecture Diagram For Web Server

![web server arch diagram](https://github.com/namdev-rathod/web-app/assets/140707502/0ff08cab-042c-4ebb-b8a0-767dcab7e20d)

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `cdk deploy`      deploy this stack to your default AWS account/region
* `cdk diff`        compare deployed stack with current state
* `cdk synth`       emits the synthesized CloudFormation template
