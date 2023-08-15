import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Stack, StackProps } from 'aws-cdk-lib';
import { Vpc, SubnetType, InstanceType, MachineImage, SecurityGroup, Port, InstanceClass, InstanceSize } from 'aws-cdk-lib/aws-ec2';
import { Schedule } from 'aws-cdk-lib/aws-applicationautoscaling';
import { ApplicationLoadBalancer, ApplicationProtocol } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import {readFileSync} from 'fs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import * as elasticloadbalancingv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as elasticloadbalancingv2targets from "aws-cdk-lib/aws-elasticloadbalancingv2-targets";
import { InstanceTarget } from 'aws-cdk-lib/aws-elasticloadbalancingv2-targets';


export class WebAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

   // Get existing VPC
    const vpc = ec2.Vpc.fromLookup(this, 'VPC', {
      vpcId: 'vpc-0e0e20c7600fd9b59', // add here your existing vpc id
    })

    // Create a new VPC with two public subnets (one in each AZ) and CIDR 10.0.0.0/16
        // const vpc = new Vpc(this, 'MyVpc', {
        //   cidr: '10.0.0.0/16',
        //   vpcName: 'webapp-vpc',
        //   maxAzs: 2,
        //   subnetConfiguration: [
        //     {
        //       name: 'Public',
        //       subnetType: SubnetType.PUBLIC,
        //     },
        //   ],
        // });

    //  create Security Group for the EC2 Instance
      const webserverSG = new ec2.SecurityGroup(this, 'webserver-sg', {
        securityGroupName: ('web-server-poc-sg'),
        vpc,
        allowAllOutbound: true,
     });

      webserverSG.addIngressRule(
        ec2.Peer.anyIpv4(),
        ec2.Port.tcp(22),
        'allow SSH access from anywhere',
     );

      webserverSG.addIngressRule(
        ec2.Peer.anyIpv4(),
        ec2.Port.tcp(80),
        'allow HTTP traffic from anywhere',
      );

      webserverSG.addIngressRule(
        ec2.Peer.anyIpv4(),
        ec2.Port.tcp(443),
        'allow HTTPS traffic from anywhere',
      );

      webserverSG.addIngressRule(
        ec2.Peer.ipv4("192.168.10.10/32"),
        ec2.Port.tcp(3309),
        'allow RDP traffic from anywhere',
      );

    // Create EBS volume with custom size
      const rootVolume: ec2.BlockDevice = {
        deviceName: '/dev/xvda', // Use the root device name from Step 1
        volume: ec2.BlockDeviceVolume.ebs(15), // Create customize the volume size in GB
      };


    // Create EC2 instances in different availability zones
        const ec2Instance1 = new ec2.Instance(this, 'EC2Instance1', {
          instanceName: ('web-server-poc-1'),
          blockDevices: [rootVolume],
          vpc,
          instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
          machineImage: new ec2.AmazonLinux2023ImageSsmParameter({
         kernel: ec2.AmazonLinux2023Kernel.KERNEL_6_1,
       }),
          keyName: 'my-first-ec2',
          vpcSubnets: {
            subnetType: ec2.SubnetType.PUBLIC, // Choose the appropriate subnet type
            availabilityZones: ['ap-south-1a'], // Specify the desired availability zone
          },
          securityGroup: webserverSG,
        });

    // Second Server    
        const ec2Instance2 = new ec2.Instance(this, 'EC2Instance2', {
          instanceName: ('web-server-poc-2'),
          blockDevices: [rootVolume],
          vpc,
          instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
          machineImage: new ec2.AmazonLinux2023ImageSsmParameter({
            kernel: ec2.AmazonLinux2023Kernel.KERNEL_6_1,
          }),
          keyName: 'my-first-ec2',
          vpcSubnets: {
            subnetType: ec2.SubnetType.PUBLIC, // Choose the appropriate subnet type
            availabilityZones: ['ap-south-1b'], // Specify the desired availability zone
          },
          securityGroup: webserverSG,
        });

    // configure user data script for EC2 instance.
      const userDataScript1 = readFileSync('./lib/user-data1.sh', 'utf8');
      const userDataScript2 = readFileSync('./lib/user-data2.sh', 'utf8');

    // add the User Data script to the EC2 Instance
      ec2Instance1.addUserData(userDataScript1);
      ec2Instance2.addUserData(userDataScript2);

    // Create an Application Load Balancer
        const loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'MyLoadBalancer', {
          loadBalancerName: 'webapp-alb',
          vpc,
          securityGroup: webserverSG,
          internetFacing: true, // Set to false for internal load balancer
            vpcSubnets: {
              subnetType: ec2.SubnetType.PUBLIC, // Choose the appropriate subnet type
              availabilityZones: ['ap-south-1a', 'ap-south-1b'], // Specify the desired availability zone
            },
         });


    // Create a Target Group with HTTP listener
    const TargetGroup = new elbv2.ApplicationTargetGroup(this, 'HttpTargetGroup', {
      targetGroupName: 'webapp-tg',
      vpc,
      protocol: elbv2.ApplicationProtocol.HTTP,
      port: 80,
      targetType: elbv2.TargetType.INSTANCE,
      healthCheck: {
        path: '/',
        protocol: elbv2.Protocol.HTTP,
      },
    });

    // Attach instance to target group
      TargetGroup.addTarget(new InstanceTarget(ec2Instance1));
      TargetGroup.addTarget(new InstanceTarget(ec2Instance2));

    // Create an HTTPS listener For Load Balancer
        const certificateArn = 'arn:aws:acm:ap-south-1:666930281169:certificate/61427c62-07d7-45c8-b46f-c5fbac653c4a'; // Replace with your ACM certificate ARN
        const httpsListener = loadBalancer.addListener('HttpsListener', {
          port: 443,
          certificates: [elbv2.ListenerCertificate.fromArn(certificateArn)],
          defaultTargetGroups: [TargetGroup],
        });

      // // Create an HTTP listener to redirect to HTTPS
         const httpListener = loadBalancer.addListener('HttpListener', {
           port: 80,
           defaultAction: elbv2.ListenerAction.redirect({
           protocol: 'HTTPS',
           port: '443',
           }),
         });

      // Get an existing hosted zone (replace 'YOUR_HOSTED_ZONE_ID' with actual ID)
        const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'ExistingHostedZone', {
          hostedZoneId: 'Z0808885ROJ6FHJCCCXN', // Replace with your actual Route53 hosted zone
          zoneName: 'awsguruji.net', // Replace with your actual domain name in Route53
        });

      // Create a DNS record for the load balancer
        new route53.ARecord(this, 'WebAppDNSRecord', {
          zone: hostedZone,
          recordName: 'app',  // Replace record name which one you want to configure Like https://app.awsguruji.net
          target: route53.RecordTarget.fromAlias(new targets.LoadBalancerTarget(loadBalancer)),
        });

        // Output the DNS name of the load balancer
          new cdk.CfnOutput(this, 'LoadBalancerDNS', {
          value: loadBalancer.loadBalancerDnsName,
        });

      }
    }
    






