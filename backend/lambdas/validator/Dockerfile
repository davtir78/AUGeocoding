FROM public.ecr.aws/lambda/python:3.11

# Install libpq for psycopg2
RUN yum update -y && \
    yum install -y postgresql-libs && \
    yum clean all

# Install dependencies
COPY requirements.txt .
RUN pip install -r requirements.txt -t ${LAMBDA_TASK_ROOT}

# Copy Handler Code
COPY index.py ${LAMBDA_TASK_ROOT}

CMD [ "index.handler" ]
